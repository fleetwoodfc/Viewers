import { IWebApiDataSource, DICOMWeb, utils } from '@ohif/core';
const { getString, getName } = DICOMWeb;
import { createDicomWebApi, DicomWebConfig } from '../DicomWebDataSource/index';

export type UpsConfig = DicomWebConfig & {
  /** Base URL for UPS-RS endpoint, e.g. /rs */
  upsRoot: string;
};

// DICOM Tag constants for UPS workitem attributes
const TAG_STUDY_INSTANCE_UID = '0020000D';
const TAG_SCHEDULED_PROC_STEP_START_DATETIME = '00404005';
const TAG_PROCEDURE_STEP_STATE = '00741000';
const TAG_MODALITIES_IN_STUDY = '00080061';
const TAG_PATIENT_NAME = '00100010';
const TAG_PATIENT_ID = '00100020';
const TAG_PATIENT_BIRTHDATE = '00100030';
const TAG_PATIENT_SEX = '00100040';
const TAG_ACCESSION_NUMBER = '00080050';
const TAG_SPS_DESCRIPTION = '00741204';
const TAG_INSTITUTION_NAME = '00080080';
const TAG_INSTANCES_NUMBER = '00201208';
const TAG_SCHEDULED_STEP_ATTR_SEQ = '00400270';
const TAG_SCHEDULED_STATION_CLASS_CODE_SEQ = '00404026';

function getStr(tag: Record<string, any>, key: string): string {
  return getString(tag[key]) ?? '';
}

function getUpsModality(workitem): string {
  const direct = getStr(workitem, '00080060');
  if (direct) return direct;

  const swcs = workitem['00404018']?.Value;
  if (swcs?.length) {
    const meaning = getString(swcs[0]['00080104']);
    if (meaning) return meaning;
  }

  const iis = workitem['00404021']?.Value;
  if (iis?.length) {
    const mod = getString(iis[0]['00080060']);
    if (mod) return mod;
  }

  const seq = workitem[TAG_SCHEDULED_STEP_ATTR_SEQ];
  if (seq && seq.Value && seq.Value.length) {
    const item = seq.Value[0];
    const mod = item['00080060'];
    if (mod && mod.Value && mod.Value.length) return String(mod.Value[0]);
  }

  const modalitiesEl = workitem[TAG_MODALITIES_IN_STUDY];
  if (modalitiesEl && modalitiesEl.Value && modalitiesEl.Value.length) {
    return modalitiesEl.Value.join('\');
  }

  return '';
}

function getStationClass(workitem): string {
  const seq = workitem[TAG_SCHEDULED_STATION_CLASS_CODE_SEQ]?.Value;
  if (seq?.length) {
    const meaning = getString(seq[0]['00080104']);
    if (meaning) return meaning;
    const code = getString(seq[0]['00080100']);
    if (code) return code;
  }
  return '';
}

function splitDateTime(dtString: string): { date: string; time: string } {
  if (!dtString) return { date: '', time: '' };
  return { date: dtString.substring(0, 8), time: dtString.substring(8) };
}

function workitemToStudyRow(workitem): Record<string, unknown> {
  const studyInstanceUID = getStr(workitem, TAG_STUDY_INSTANCE_UID);
  const { date, time } = splitDateTime(getStr(workitem, TAG_SCHEDULED_PROC_STEP_START_DATETIME));

  return {
    studyInstanceUid: studyInstanceUID,
    date,
    time,
    accession: getStr(workitem, TAG_ACCESSION_NUMBER),
    mrn: getStr(workitem, TAG_PATIENT_ID),
    patientName: utils.formatPN(getName(workitem[TAG_PATIENT_NAME])) || '',
    patientBirthdate: getStr(workitem, TAG_PATIENT_BIRTHDATE),
    sex: getStr(workitem, TAG_PATIENT_SEX),
    description: getStr(workitem, TAG_SPS_DESCRIPTION),
    modalities: getUpsModality(workitem),
    instances: getStr(workitem, TAG_INSTANCES_NUMBER) || '',
    NumInstances: Number(getStr(workitem, TAG_INSTANCES_NUMBER)) || 0,
    procedureStepState: getStr(workitem, TAG_PROCEDURE_STEP_STATE),
    institutionName: getStr(workitem, TAG_INSTITUTION_NAME),
    stationClass: getStationClass(workitem),
  };
}

function mapUpsQueryParams(
  origParams,
  options: { supportsFuzzyMatching?: boolean; supportsWildcard?: boolean } = {}
): Record<string, string> {
  const params: Record<string, string> = {};

  if (!origParams) return params;

  const {
    patientName,
    patientId,
    startDate,
    endDate,
    studyDescription,
    accessionNumber,
    modalitiesInStudy: _modalitiesInStudy,
    studyInstanceUid,
  } = origParams;

  if (patientName) params['00100010'] = options.supportsWildcard ? `*${patientName}*` : patientName;
  if (patientId) params['00100020'] = patientId;
  if (startDate && endDate) {
    params['00404005'] = `${startDate}-${endDate}`;
  } else if (startDate) {
    params['00404005'] = `${startDate}-`;
  } else if (endDate) {
    params['00404005'] = `-${endDate}`;
  }
  if (studyDescription) params['00741204'] = options.supportsWildcard ? `*${studyDescription}*` : studyDescription;
  if (accessionNumber) params['00080050'] = accessionNumber;
  // _modalitiesInStudy omitted: Modality in UPS is nested within ScheduledStepAttributesSequence;
  // top-level QIDO filtering on ModalitiesInStudy (00080061) is not standard for UPS workitem queries.
  if (studyInstanceUid) params['0020000D'] = studyInstanceUid;

  params['includefield'] = [
    '00100010', // PatientName
    '00100020', // PatientID
    '00080050', // AccessionNumber
    '00404005', // Scheduled Procedure Step Start DateTime
    '00741204', // Procedure Step Label (description)
    '00080060', // Modality
    '00404018', // ScheduledWorkitemCodeSequence (used for modality fallback)
    '00404021', // InputInformationSequence (used for modality fallback)
    '00404026', // Scheduled Station Class Code Sequence
    '0020000D', // StudyInstanceUID
    '00741000', // Procedure Step State
    '00080018', // SOP Instance UID (workitem UID)
  ].join(',');

  return params;
}

function createDicomWebUpsApi(upsConfig: UpsConfig, servicesManager) {
  // Create the full DicomWeb base implementation (QIDO + WADO)
  const dicomWebImpl = createDicomWebApi(upsConfig, servicesManager);

  const { userAuthenticationService } = servicesManager.services;

  const getAuthorizationHeader = () => {
    const headers: Record<string, string> = {};
    const auth = userAuthenticationService.getAuthorizationHeader();
    if (auth && auth.Authorization) headers.Authorization = auth.Authorization;
    return headers;
  };

  const upsGet = async (
    path: string,
    queryParams: Record<string, string> = {}
  ): Promise<unknown[]> => {
    const url = new URL(`${upsConfig.upsRoot}${path}`, window.location.origin);
    Object.entries(queryParams).forEach(([k, v]) => url.searchParams.set(k, v));
    const response = await fetch(url.toString(), {
      headers: { ...getAuthorizationHeader(), Accept: 'application/dicom+json' },
    });
    if (response.status === 204) return [];
    if (!response.ok) throw new Error(`UPS-RS [${response.status}]: ${url}`);
    return response.json();
  };

  const upsQueryOptions = {
    supportsFuzzyMatching: upsConfig.supportsFuzzyMatching,
    supportsWildcard: upsConfig.supportsWildcard,
  };

  const implementation = {
    ...dicomWebImpl,

    initialize: ({ params, query }) => {
      if (upsConfig.onConfiguration && typeof upsConfig.onConfiguration === 'function') {
        Object.assign(upsConfig, upsConfig.onConfiguration(upsConfig, { params, query }));
      }
      // Only delegate to the DicomWeb initialize if QIDO/WADO roots are configured,
      // since a UPS-only setup may not have them.
      if (upsConfig.qidoRoot || upsConfig.wadoRoot) {
        dicomWebImpl.initialize({ params, query });
      }
    },

    query: {
      /**
       * Inherit query.studies directly from DicomWebDataSource so that standard
       * QIDO-RS study searches (e.g. prior studies in the study browser) continue
       * to work unchanged against the configured qidoRoot.
       */
      studies: dicomWebImpl.query.studies,

      /**
       * query.workitems is the dedicated UPS-RS query namespace.
       * It queries the UPS-RS /workitems endpoint and maps the resulting workitem
       * attributes into the same normalised row shape used by the study list, so
       * the existing Worklist UI can render them without changes.
       *
       * DataSourceWrapper can be directed here via
       * dataSource.getConfig().defaultListType === 'workitems'.
       */
      workitems: {
        mapParams: (origParams) => mapUpsQueryParams(origParams, upsQueryOptions),
        search: async (origParams) => {
          const mappedParams = mapUpsQueryParams(origParams, upsQueryOptions);
          const workitems = await upsGet('/workitems', mappedParams);
          return (workitems || []).map(workitemToStudyRow);
        },
        processResults: (workitems) => (workitems || []).map(workitemToStudyRow),
      },

      series: dicomWebImpl.query.series,
      instances: dicomWebImpl.query.instances,
    },

    getConfig: () => ({
      ...dicomWebImpl.getConfig(),
      /** Signals DataSourceWrapper to use query.workitems.search for the worklist */
      defaultListType: 'workitems',
    }),

    store: {
      ...dicomWebImpl.store,
      workitem: async (dataset, workitemUID?: string) => {
        const path = workitemUID ? `/workitems/${workitemUID}` : '/workitems';
        const url = new URL(`${upsConfig.upsRoot}${path}`, window.location.origin);
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { ...getAuthorizationHeader(), 'Content-Type': 'application/dicom+json' },
          body: JSON.stringify(dataset),
        });
        if (!response.ok) throw new Error(`UPS-RS workitem POST [${response.status}]: ${url}`);
        return response;
      },
      changeState: async (workitemUID: string, state: string, transactionUID?: string) => {
        const url = new URL(
          `${upsConfig.upsRoot}/workitems/${workitemUID}/state`,
          window.location.origin
        );
        const body: Record<string, unknown> = { '00741000': { vr: 'CS', Value: [state] } };
        if (transactionUID) body['00081195'] = { vr: 'UI', Value: [transactionUID] };
        const response = await fetch(url.toString(), {
          method: 'PUT',
          headers: { ...getAuthorizationHeader(), 'Content-Type': 'application/dicom+json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`UPS-RS changeState PUT [${response.status}]: ${url}`);
        return response;
      },
      subscribe: async (workitemUID: string, aetitle: string) => {
        const url = new URL(
          `${upsConfig.upsRoot}/workitems/${workitemUID}/subscribers/${aetitle}`,
          window.location.origin
        );
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: getAuthorizationHeader(),
        });
        if (!response.ok) throw new Error(`UPS-RS subscribe POST [${response.status}]: ${url}`);
        return response;
      },
    },
  };

  return IWebApiDataSource.create(implementation);
}

export { createDicomWebUpsApi };