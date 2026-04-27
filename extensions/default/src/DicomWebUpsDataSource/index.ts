import { IWebApiDataSource, DICOMWeb, utils, errorHandler } from '@ohif/core';

const { getString, getName, getModalities } = DICOMWeb;

// ---------------------------------------------------------------------------
// UPS-RS DICOM tag constants
// ---------------------------------------------------------------------------

// Patient / Study level tags (carried in UPS dataset)
const TAG = {
  // Study reference
  STUDY_INSTANCE_UID:           '0020000D',
  // Patient
  PATIENT_NAME:                 '00100010',
  PATIENT_ID:                   '00100020',
  // Scheduled Procedure Step
  SPS_START_DATETIME:           '00404005', // Scheduled Procedure Step Start DateTime (DT)
  SPS_DESCRIPTION:              '00741204', // Procedure Step Label (LO)
  SPS_ID:                       '00400009', // Scheduled Procedure Step ID
  ACCESSION_NUMBER:             '00080050',
  // Modality - UPS uses Scheduled Station Class Code Sequence or Input Info Sequence
  // Most real-world servers also carry (0040,0009) and ModalitiesInStudy in Input Info
  INPUT_INFO_SEQUENCE:          '00404021', // Input Information Sequence
  SCHEDULED_STATION_CLASS_CODE: '00404026', // Scheduled Station Class Code Sequence
  PROCEDURE_CODE_SEQUENCE:      '00081032', // Procedure Code Sequence
  // Procedure Step State
  PROCEDURE_STEP_STATE:         '00741000', // CS: SCHEDULED | IN PROGRESS | COMPLETED | CANCELED
  // Instance count - UPS doesn't carry this natively; we default to 0
};

// ---------------------------------------------------------------------------
// Helper: safely extract first string value from a DICOM JSON attribute
// ---------------------------------------------------------------------------
function getStr(tag: Record<string, any>, key: string): string {
  return getString(tag[key]) ?? '';
}

// ---------------------------------------------------------------------------
// Helper: derive a modality string from a UPS workitem.
// UPS doesn't have ModalitiesInStudy – we look in common locations.
// ---------------------------------------------------------------------------
function getUpsModality(workitem: Record<string, any>): string {
  // 1. Try direct Modality tag (some servers include it)
  const direct = getStr(workitem, '00080060');
  if (direct) return direct;

  // 2. Try ScheduledWorkitemCodeSequence > Code Meaning (00080104)
  const swcs = workitem['00404018']?.Value;
  if (swcs?.length) {
    const meaning = getString(swcs[0]['00080104']);
    if (meaning) return meaning;
  }

  // 3. Try InputInformationSequence (00404021) > Modality
  const iis = workitem[TAG.INPUT_INFO_SEQUENCE]?.Value;
  if (iis?.length) {
    const mod = getString(iis[0]['00080060']);
    if (mod) return mod;
  }

  return '';
}

// ---------------------------------------------------------------------------
// Helper: build a DICOM date string (YYYYMMDD) and time string (HHmmss)
// from a DT value like "20240315120000.000000+0000"
// ---------------------------------------------------------------------------
function splitDateTime(dt: string): { date: string; time: string } {
  if (!dt || dt.length < 8) {
    return { date: '', time: '' };
  }
  const date = dt.substring(0, 8);           // YYYYMMDD
  const time = dt.length >= 14
    ? dt.substring(8, 14)                    // HHmmss
    : '';
  return { date, time };
}

// ---------------------------------------------------------------------------
// Core mapping: UPS workitem JSON → WorkList study row shape
// This matches exactly what processResults() in qido.js produces.
// ---------------------------------------------------------------------------
function workitemToStudyRow(workitem: Record<string, any>): Record<string, any> {
  const spsDT = getStr(workitem, TAG.SPS_START_DATETIME);
  const { date, time } = splitDateTime(spsDT);

  // Patient name: UPS carries it in (0010,0010) same as QIDO
  const rawName = workitem[TAG.PATIENT_NAME];
  const patientName = utils.formatPN(getName(rawName)) || '';

  return {
    // Required by WorkList.tsx row rendering
    studyInstanceUid: getStr(workitem, TAG.STUDY_INSTANCE_UID),
    date,                                                // YYYYMMDD  → formatted by WorkList
    time,                                                // HHmmss    → formatted by WorkList
    accession: getStr(workitem, TAG.ACCESSION_NUMBER),
    mrn: getStr(workitem, TAG.PATIENT_ID),
    patientName,
    instances: 0,                                        // UPS has no instance count
    description: getStr(workitem, TAG.SPS_DESCRIPTION),
    modalities: getUpsModality(workitem),

    // Extra UPS-specific fields preserved for downstream use (e.g. state change)
    procedureStepState: getStr(workitem, TAG.PROCEDURE_STEP_STATE),
    workitemUID: getStr(workitem, '00080018'),            // SOP Instance UID = workitem UID
  };
}

// ---------------------------------------------------------------------------
// Filter/sort mapping: WorkList filter values → UPS-RS query params
// UPS-RS supports a subset of QIDO-style attribute matching on workitems.
// Reference: PS3.18 sect. 11.5 (Search for Workitems)
// ---------------------------------------------------------------------------
function mapUpsQueryParams(
  origParams: Record<string, any>,
  options: { supportsFuzzyMatching?: boolean; supportsWildcard?: boolean } = {}
): Record<string, string> {
  if (!origParams) {
    return {};
  }

  const useWildcard =
    origParams.disableWildcard !== undefined
      ? !origParams.disableWildcard
      : options.supportsWildcard;

  const withWildcard = (value: string | undefined) =>
    useWildcard && value ? `*${value}*` : value;

  const params: Record<string, string | number | boolean | undefined> = {
    // Patient Name  (0010,0010)
    PatientName: withWildcard(origParams.patientName),
    // Patient ID / MRN  (0010,0020)
    '00100020': withWildcard(origParams.mrn),
    // Accession Number  (0008,0050)
    AccessionNumber: withWildcard(origParams.accession),
    // Procedure Step Label  (0074,1204) — maps to "description" filter
    '00741204': withWildcard(origParams.description),
    // Modality  — UPS-RS allows matching on ScheduledWorkitemCodeSequence
    // but most servers also accept (0008,0060) as a filter; include both
    '00080060': origParams.modalities?.length
      ? origParams.modalities.join('\\')
      : undefined,
    // Pagination
    limit: origParams.limit || 101,
    offset: origParams.offset || 0,
    fuzzymatching: options.supportsFuzzyMatching === true,
    // Include extra fields in response
    includefield: [
      '00100010', // PatientName
      '00100020', // PatientID
      '00080050', // AccessionNumber
      '00404005', // Scheduled Procedure Step Start DateTime
      '00741204', // Procedure Step Label
      '00080060', // Modality
      '00404021', // InputInformationSequence
      '0020000D', // StudyInstanceUID
      '00741000', // Procedure Step State
      '00080018', // SOP Instance UID (workitem UID)
    ].join(','),
  };

  // Date range → ScheduledProcedureStepStartDateTime range (DT format)
  const { startDate, endDate } = origParams.studyDate || {};
  if (startDate && endDate) {
    params['00404005'] = `${startDate}-${endDate}`;
  } else if (startDate) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    params['00404005'] = `${startDate}-${todayStr}`;
  } else if (endDate) {
    params['00404005'] = `19700102-${endDate}`;
  }

  // Study Instance UID
  if (origParams.studyInstanceUid) {
    let uids = origParams.studyInstanceUid;
    uids = Array.isArray(uids) ? uids.join() : uids;
    params['0020000D'] = uids;
  }

  // Remove empty / undefined entries
  const final: Record<string, string> = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      final[key] = String(value);
    }
  });

  return final;
}

// ---------------------------------------------------------------------------
// Data source factory — mirrors createDicomWebApi's structure so WorkList
// can use this source without any changes to WorkList.tsx or its parent.
// ---------------------------------------------------------------------------
export type UpsConfig = {
  name: string;
  /** Base URL for UPS-RS endpoint, e.g. https://your-pacs/rs */
  upsRoot: string;
  supportsFuzzyMatching?: boolean;
  supportsWildcard?: boolean;
  friendlyName?: string;
};

function createDicomWebUpsApi(upsConfig: UpsConfig, servicesManager) {
  const { userAuthenticationService } = servicesManager.services;

  const getAuthorizationHeader = (): Record<string, string> => {
    const headers: Record<string, string> = {};
    const auth = userAuthenticationService.getAuthorizationHeader();
    if (auth?.Authorization) {
      headers.Authorization = auth.Authorization;
    }
    return headers;
  };

  // Shared fetch wrapper with auth + JSON accept header
  const upsGet = async (path: string, queryParams: Record<string, string> = {}) => {
    const url = new URL(`${upsConfig.upsRoot}${path}`);
    Object.entries(queryParams).forEach(([k, v]) => url.searchParams.set(k, v));

    const response = await fetch(url.toString(), {
      headers: {
        ...getAuthorizationHeader(),
        Accept: 'application/dicom+json',
      },
    });

    if (response.status === 204) {
      // No content — empty result set
      return [];
    }
    if (!response.ok) {
      const errMsg = `UPS-RS request failed [${response.status}]: ${url.toString()}`;
      console.error(errMsg);
      throw new Error(errMsg);
    }
    return response.json();
  };

  const implementation = {
    initialize: ({ params, query }) => {
      // Nothing to initialize for a stateless HTTP client;
      // auth headers are fetched fresh on each request.
    },

    // -----------------------------------------------------------------------
    // query.studies.search
    // Called by WorkList.tsx via the data source to populate the study list.
    // We call GET {upsRoot}/workitems and map the results to study rows.
    // -----------------------------------------------------------------------
    query: {
      studies: {
        mapParams: (origParams) =>
          mapUpsQueryParams(origParams, {
            supportsFuzzyMatching: upsConfig.supportsFuzzyMatching,
            supportsWildcard: upsConfig.supportsWildcard,
          }),

        search: async (origParams) => {
          const mappedParams = mapUpsQueryParams(origParams, {
            supportsFuzzyMatching: upsConfig.supportsFuzzyMatching,
            supportsWildcard: upsConfig.supportsWildcard,
          });

          const workitems = await upsGet('/workitems', mappedParams);

          if (!workitems || !workitems.length) {
            return [];
          }

          return workitems.map(workitemToStudyRow);
        },

        processResults: (workitems) => {
          if (!workitems || !workitems.length) return [];
          return workitems.map(workitemToStudyRow);
        },
      },

      // -----------------------------------------------------------------------
      // query.series.search
      // Called when a study row is expanded. UPS workitems don't have real
      // series, so we return a single stub series to prevent an empty panel
      // and give the user context about the scheduled procedure step.
      // -----------------------------------------------------------------------
      series: {
        search: async (studyInstanceUid: string) => {
          // Retrieve workitems referencing this StudyInstanceUID
          let workitems: Record<string, any>[] = [];
          try {
            workitems = await upsGet('/workitems', {
              '0020000D': studyInstanceUid,
              includefield: '00741204,00741000,00080060,00400009,00404005,00080018',
            });
          } catch (_) {
            // Silently fall back to a generic stub if the query fails
          }

          if (!workitems?.length) {
            return [
              {
                studyInstanceUid,
                seriesInstanceUid: studyInstanceUid,
                modality: '',
                seriesNumber: '1',
                seriesDate: '',
                numSeriesInstances: 0,
                description: 'Scheduled Procedure Step',
              },
            ];
          }

          // Map each matching workitem to a series-shaped object
          return workitems.map((wi, idx) => {
            const spsDT = getStr(wi, TAG.SPS_START_DATETIME);
            const { date } = splitDateTime(spsDT);
            const state = getStr(wi, TAG.PROCEDURE_STEP_STATE);
            const label = getStr(wi, TAG.SPS_DESCRIPTION);
            const spsId = getStr(wi, TAG.SPS_ID);

            return {
              studyInstanceUid,
              seriesInstanceUid: getStr(wi, '00080018') || `${studyInstanceUid}.${idx + 1}`,
              modality: getUpsModality(wi),
              seriesNumber: spsId || String(idx + 1),
              seriesDate: date,
              numSeriesInstances: 0,
              description: state ? `[${state}] ${label}` : label,
            };
          });
        },
      },

      // -----------------------------------------------------------------------
      // query.instances.search — UPS has no instances, return empty array
      // -----------------------------------------------------------------------
      instances: {
        search: async () => [],
      },
    },

    // -----------------------------------------------------------------------
    // retrieve.series.metadata
    // Called when OHIF tries to load images for a study. UPS workitems have
    // no image data, so we return an empty result immediately.
    // -----------------------------------------------------------------------
    retrieve: {
      series: {
        metadata: async () => {
          return [];
        },
      },
      directURL: () => undefined,
    },

    // -----------------------------------------------------------------------
    // store — expose workitem create / state-change operations for commands
    // -----------------------------------------------------------------------
    store: {
      /**
       * Create a new UPS workitem.
       * POST {upsRoot}/workitems
       * @returns Location header value (URI of created workitem)
       */
      workitem: async (dataset: object, workitemUID?: string) => {
        const url = new URL(
          workitemUID
            ? `${upsConfig.upsRoot}/workitems?workitem=${workitemUID}`
            : `${upsConfig.upsRoot}/workitems`
        );
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            ...getAuthorizationHeader(),
            'Content-Type': 'application/dicom+json',
          },
          body: JSON.stringify(dataset),
        });
        if (!response.ok) {
          throw new Error(`UPS create failed [${response.status}]`);
        }
        return response.headers.get('Location');
      },

      /**
       * Change procedure step state.
       * PUT {upsRoot}/workitems/{uid}/state
       * @param state  'IN PROGRESS' | 'COMPLETED' | 'CANCELED'
       * @param transactionUID  Required when transitioning to IN PROGRESS
       */
      changeState: async (
        workitemUID: string,
        state: 'SCHEDULED' | 'IN PROGRESS' | 'COMPLETED' | 'CANCELED',
        transactionUID?: string
      ) => {
        const stateDS: Record<string, unknown> = {
          '00741000': { vr: 'CS', Value: [state] },
        };
        if (transactionUID) {
          stateDS['00081195'] = { vr: 'UI', Value: [transactionUID] };
        }
        const response = await fetch(
          `${upsConfig.upsRoot}/workitems/${workitemUID}/state`,
          {
            method: 'PUT',
            headers: {
              ...getAuthorizationHeader(),
              'Content-Type': 'application/dicom+json',
            },
            body: JSON.stringify(stateDS),
          }
        );
        if (!response.ok) {
          throw new Error(
            `UPS state change to '${state}' failed [${response.status}] for workitem ${workitemUID}`
          );
        }
      },

      /**
       * Subscribe to UPS events.
       * POST {upsRoot}/workitems/{uid}/subscribers/{aetitle}
       * Use uid '1.2.840.10008.5.1.4.34.5' to subscribe to all workitems.
       */
      subscribe: async (workitemUID: string, aetitle: string) => {
        const response = await fetch(
          `${upsConfig.upsRoot}/workitems/${workitemUID}/subscribers/${aetitle}`,
          {
            method: 'POST',
            headers: getAuthorizationHeader(),
          }
        );
        if (!response.ok) {
          throw new Error(
            `UPS subscribe failed [${response.status}] for workitem ${workitemUID}`
          );
        }
      },
    },

    getConfig: () => ({ ...upsConfig }),

    /**
     * getStudyInstanceUIDs is called by the Mode route to determine which
     * studies to load when launching a viewer from the worklist.
     * We pass through the standard URL parameter handling.
     */
    getStudyInstanceUIDs: ({ params, query }) => {
      const paramsUIDs = params.StudyInstanceUIDs || params.studyInstanceUIDs;
      const queryUIDs = utils.splitComma(
        query.getAll('StudyInstanceUIDs').concat(query.getAll('studyInstanceUIDs'))
      );
      const StudyInstanceUIDs = (queryUIDs.length && queryUIDs) || paramsUIDs;
      return Array.isArray(StudyInstanceUIDs) ? StudyInstanceUIDs : [StudyInstanceUIDs];
    },
  };

  return IWebApiDataSource.create(implementation);
}

export { createDicomWebUpsApi };