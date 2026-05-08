import { IWebApiDataSource, DICOMWeb, utils } from '@ohif/core';
const { getString, getName } = DICOMWeb;
import { createDicomWebApi, DicomWebConfig } from '../DicomWebDataSource/index';

export type UpsConfig = DicomWebConfig & {
  /** Base URL for UPS-RS endpoint, e.g. /rs */
  upsRoot: string;
  /**
   * AE title of this performer station.
   * When set: enables the "Reject" button on assigned workitems (FR-006)
   * and the real-time WebSocket notification channel (FR-011).
   * When absent: Reject button is hidden; WebSocket is not opened.
   */
  performerAeTitle?: string;
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
const TAG_SCHEDULED_PROC_STEP_PRIORITY = '00741200';
const TAG_SPS_DESCRIPTION = '00741204';
const TAG_INSTITUTION_NAME = '00080080';
const TAG_INSTANCES_NUMBER = '00201208';
const TAG_SCHEDULED_STEP_ATTR_SEQ = '00400270';
const TAG_SCHEDULED_STATION_CLASS_CODE_SEQ = '00404026';

function getStr(tag: Record<string, any>, key: string): string {
  return getString(tag[key]) ?? '';
}

function getUpsModality(workitem: Record<string, any>): string {
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
    return modalitiesEl.Value.join('\\');
  }

  return '';
}

function getStationClass(workitem: Record<string, any>): string {
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

function workitemToStudyRow(workitem: Record<string, any>): Record<string, unknown> {
  const studyInstanceUID = getStr(workitem, TAG_STUDY_INSTANCE_UID);
  const { date, time } = splitDateTime(getStr(workitem, TAG_SCHEDULED_PROC_STEP_START_DATETIME));

  return {
    studyInstanceUid: studyInstanceUID,
    date,
    time,
    accession: getStr(workitem, TAG_ACCESSION_NUMBER),
    priority: getStr(workitem, TAG_SCHEDULED_PROC_STEP_PRIORITY),
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
    _rawDicom: workitem,
  };
}

function mapUpsQueryParams(
  origParams: Record<string, any>,
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
    priority,
    modalitiesInStudy: _modalitiesInStudy,
    studyInstanceUid,
    procedureStepState,
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
  if (studyDescription)
    params['00741204'] = options.supportsWildcard ? `*${studyDescription}*` : studyDescription;
  if (accessionNumber) params['00080050'] = accessionNumber;
  if (priority) {
    const p = Array.isArray(priority) ? priority[0] : priority;
    if (p) params['00741200'] = p;
  }
  if (studyInstanceUid) params['0020000D'] = studyInstanceUid;
  if (procedureStepState) {
    const state = Array.isArray(procedureStepState) ? procedureStepState[0] : procedureStepState;
    if (state) params['00741000'] = state;
  }

  params['includefield'] = [
    '00100010',
    '00100020',
    '00080050',
    '00404005',
    '00741204',
    '00080060',
    '00404018',
    '00404021',
    '00404026',
    '0020000D',
    '00741000',
    '00741200',
    '00080018',
  ].join(',');

  return params;
}

function createDicomWebUpsApi(upsConfig: UpsConfig, servicesManager: any) {
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

  const upsRequest = async (
    method: string,
    path: string,
    opts: { body?: unknown; queryParams?: Record<string, string>; contentType?: string } = {}
  ): Promise<Response> => {
    const url = new URL(`${upsConfig.upsRoot}${path}`, window.location.origin);
    if (opts.queryParams) {
      Object.entries(opts.queryParams).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    const headers: Record<string, string> = { ...getAuthorizationHeader() };
    if (opts.contentType) headers['Content-Type'] = opts.contentType;
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!response.ok && response.status !== 202) {
      throw new Error(`UPS-RS ${method} [${response.status}]: ${url}`);
    }
    return response;
  };

  const upsQueryOptions = {
    supportsFuzzyMatching: upsConfig.supportsFuzzyMatching,
    supportsWildcard: upsConfig.supportsWildcard,
  };

  const implementation = {
    ...dicomWebImpl,

    initialize: ({
      params,
      query,
    }: {
      params: Record<string, any>;
      query: Record<string, any>;
    }) => {
      if (upsConfig.onConfiguration && typeof upsConfig.onConfiguration === 'function') {
        Object.assign(upsConfig, upsConfig.onConfiguration(upsConfig, { params, query }));
      }
      if (upsConfig.qidoRoot || upsConfig.wadoRoot) {
        dicomWebImpl.initialize({ params, query });
      }
    },

    query: {
      studies: dicomWebImpl.query.studies,
      workitems: {
        mapParams: (origParams: Record<string, any>) =>
          mapUpsQueryParams(origParams, upsQueryOptions),
        search: async (origParams: Record<string, any>) => {
          const mappedParams = mapUpsQueryParams(origParams, upsQueryOptions);
          const workitems = await upsGet('/workitems', mappedParams);
          return (workitems || []).map(workitemToStudyRow);
        },
        processResults: (workitems: Record<string, any>[]) =>
          (workitems || []).map(workitemToStudyRow),
      },
      series: dicomWebImpl.query.series,
      instances: dicomWebImpl.query.instances,
    },

    getConfig: () => ({ ...dicomWebImpl.getConfig(), ...upsConfig }),

    retrieve: {
      ...dicomWebImpl.retrieve,
      workitem: async (uid: string): Promise<Record<string, unknown>> => {
        const results = await upsGet(`/workitems/${uid}`);
        return (results as Record<string, unknown>[])[0];
      },
      subscriptionChannel: async (aeTitle: string): Promise<Response> => {
        const url = new URL(`${upsConfig.upsRoot}/subscribers/${aeTitle}`, window.location.origin);
        const response = await fetch(url.toString(), { headers: getAuthorizationHeader() });
        if (!response.ok) throw new Error(`UPS-RS GET [${response.status}]: ${url}`);
        return response;
      },
    },

    store: {
      ...dicomWebImpl.store,
      workitem: async (dataset: unknown, workitemUID?: string): Promise<Response> => {
        const url = new URL(`${upsConfig.upsRoot}/workitems`, window.location.origin);
        if (workitemUID) url.searchParams.set('AffectedSOPInstanceUID', workitemUID);
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: { ...getAuthorizationHeader(), 'Content-Type': 'application/dicom+json' },
          body: JSON.stringify(dataset),
        });
        if (!response.ok) throw new Error(`UPS-RS POST [${response.status}]: ${url}`);
        return response;
      },
      updateWorkitem: async (
        uid: string,
        dataset: unknown,
        transactionUID?: string
      ): Promise<Response> => {
        // dcm4chee-arc requires the Transaction UID in the request body as
        // tag 00081195 for Update UPS (POST /workitems/{uid}).
        const body = transactionUID
          ? {
              ...(dataset as Record<string, unknown>),
              '00081195': { vr: 'UI', Value: [transactionUID] },
            }
          : dataset;
        return upsRequest('POST', `/workitems/${uid}`, {
          body,
          contentType: 'application/dicom+json',
        });
      },
      changeState: async (
        workitemUID: string,
        state: string,
        transactionUID?: string,
        extraAttributes?: Record<string, unknown>
      ): Promise<Response> => {
        // dcm4chee-arc (and some other SCP implementations) require the calling
        // AE title appended to the URL: PUT /workitems/{uid}/state/{aet}
        // Falls back to the standard PS3.18 URL when performerAeTitle is absent.
        const statePath = upsConfig.performerAeTitle
          ? `${upsConfig.upsRoot}/workitems/${workitemUID}/state/${upsConfig.performerAeTitle}`
          : `${upsConfig.upsRoot}/workitems/${workitemUID}/state`;
        const url = new URL(statePath, window.location.origin);
        const body: Record<string, unknown> = {
          '00741000': { vr: 'CS', Value: [state] },
          ...extraAttributes,
        };
        if (transactionUID) body['00081195'] = { vr: 'UI', Value: [transactionUID] };
        const response = await fetch(url.toString(), {
          method: 'PUT',
          headers: { ...getAuthorizationHeader(), 'Content-Type': 'application/dicom+json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`UPS-RS PUT [${response.status}]: ${url}`);
        return response;
      },
      cancelWorkitem: async (uid: string): Promise<Response> => {
        return upsRequest('POST', `/workitems/${uid}/cancelrequest`, {
          contentType: 'application/dicom+json',
        });
      },
      subscribe: async (
        workitemUID: string,
        aeTitle: string,
        deletionLock?: boolean
      ): Promise<Response> => {
        return upsRequest('POST', `/workitems/${workitemUID}/subscribers/${aeTitle}`, {
          queryParams: deletionLock ? { deletionlock: '1' } : {},
        });
      },
      suspendSubscription: async (aeTitle: string): Promise<Response> => {
        return upsRequest('POST', `/workitems/1.2.840.10008.5.1.4.34.5/subscribers/${aeTitle}`);
      },
      deleteSubscription: async (uid: string, aeTitle: string): Promise<Response> => {
        return upsRequest('DELETE', `/workitems/${uid}/subscribers/${aeTitle}`);
      },
    },
  };

  return IWebApiDataSource.create(implementation);
}

export { createDicomWebUpsApi };
