import React, { useState, useEffect, useMemo } from 'react';
import classnames from 'classnames';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import moment from 'moment';
import qs from 'query-string';
import isEqual from 'lodash.isequal';
import { useTranslation } from 'react-i18next';

import filtersMeta from './filtersMeta.js';
import WorkItemDetailsModal from './WorkItemDetailsModal';
import WorkItemActionsPanel from './WorkItemActionsPanel';
import CancelWorkitemModal from './CancelWorkitemModal';
import { useWorkitemActions } from './useWorkitemActions';
import { useUpsNotifications } from './useUpsNotifications';
import { useAppConfig } from '@state';
import { useDebounce, useSearchParams } from '../../hooks';
import { utils, Types as coreTypes } from '@ohif/core';

import {
  EmptyStudies,
  StudyListExpandedRow,
  StudyListTable,
  StudyListPagination,
  StudyListFilter,
  Button,
  ButtonEnums,
} from '@ohif/ui';

import {
  Header,
  Icons,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Clipboard,
  useModal,
  useSessionStorage,
  Onboarding,
  ScrollArea,
  InvestigationalUseDialog,
} from '@ohif/ui-next';

import { Types } from '@ohif/ui';

import { preserveQueryParameters, preserveQueryStrings } from '../../utils/preserveQueryParameters';

const PatientInfoVisibility = Types.PatientInfoVisibility;

const { sortBySeriesDate } = utils;

const seriesInStudiesMap = new Map();

const STEP_STATE_COLORS: Record<string, string> = {
  SCHEDULED: 'text-blue-400',
  'IN PROGRESS': 'text-yellow-400',
  COMPLETED: 'text-green-400',
  CANCELED: 'text-red-400',
};

/**
 * WorkItemsList displays UPS (Unified Procedure Step) workitems from a
 * DicomWebUps data source, allowing users to search and launch studies
 * associated with scheduled procedure steps.
 */
function WorkItemsList({
  data: workitems,
  dataTotal: workitemsTotal,
  isLoadingData,
  dataSource,
  hotkeysManager,
  dataPath,
  onRefresh,
  servicesManager,
}: withAppTypes) {
  const { show } = useModal();
  const { t } = useTranslation();
  const [appConfig] = useAppConfig();
  const searchParams = useSearchParams();
  const navigate = useNavigate();
  const ITEMS_LIMIT = 101;
  const queryFilterValues = _getQueryFilterValues(searchParams);
  const [sessionQueryFilterValues, updateSessionQueryFilterValues] = useSessionStorage({
    key: 'workitemsQueryFilterValues',
    defaultValue: queryFilterValues,
    clearOnUnload: true,
  });

  const [filterValues, _setFilterValues] = useState({
    ...defaultFilterValues,
    ...sessionQueryFilterValues,
  });

  const debouncedFilterValues = useDebounce(filterValues, 200);
  const { resultsPerPage, pageNumber, sortBy, sortDirection } = filterValues;

  const filteredWorkitems = useMemo(() => {
    if (!filterValues.priority?.length) return workitems;
    const selected = new Set(filterValues.priority.map((p: string) => p.toUpperCase()));
    return workitems.filter(w => selected.has(((w as any).priority || '').toUpperCase()));
  }, [workitems, filterValues.priority]);

  const canSort = filteredWorkitems.length < ITEMS_LIMIT;
  const shouldUseDefaultSort = sortBy === '' || !sortBy;
  const sortModifier = sortDirection === 'descending' ? 1 : -1;
  const defaultSortValues =
    shouldUseDefaultSort && canSort ? { sortBy: 'date', sortDirection: 'ascending' } : {};
  const { customizationService, uiNotificationService } = servicesManager.services;

  const { claim, complete, cancel, reject, getActionState } = useWorkitemActions({
    dataSource,
    onRefresh,
    uiNotificationService,
  });

  // P3: real-time assignment notifications via UPS-RS WebSocket channel
  const performerAeTitle: string | undefined = (dataSource as any).getConfig?.()?.performerAeTitle;

  useUpsNotifications({
    dataSource,
    performerAeTitle,
    onAssigned: (_workitemUID: string) => {
      // Refresh is already called inside the hook after onAssigned
    },
    onRefresh,
    uiNotificationService,
  });

  const sortedWorkitems = useMemo(() => {
    if (!canSort) {
      return filteredWorkitems;
    }
    return [...filteredWorkitems].sort((s1, s2) => {
      if (shouldUseDefaultSort) {
        return _sortStringDates(s1, s2, -1);
      }
      const s1Prop = s1[sortBy];
      const s2Prop = s2[sortBy];
      if (typeof s1Prop === 'string' && typeof s2Prop === 'string') {
        return s1Prop.localeCompare(s2Prop) * sortModifier;
      } else if (typeof s1Prop === 'number' && typeof s2Prop === 'number') {
        return (s1Prop > s2Prop ? 1 : -1) * sortModifier;
      } else if (!s1Prop && s2Prop) {
        return -1 * sortModifier;
      } else if (!s2Prop && s1Prop) {
        return 1 * sortModifier;
      } else if (sortBy === 'date') {
        return _sortStringDates(s1, s2, sortModifier);
      }
      return 0;
    });
  }, [canSort, workitems, shouldUseDefaultSort, sortBy, sortModifier]);

  const [expandedRows, setExpandedRows] = useState([]);
  const [studiesWithSeriesData, setStudiesWithSeriesData] = useState([]);
  const numOfWorkitems = workitemsTotal;
  const querying = useMemo(() => {
    return isLoadingData || expandedRows.length > 0;
  }, [isLoadingData, expandedRows]);

  const setFilterValues = val => {
    if (filterValues.pageNumber === val.pageNumber) {
      val.pageNumber = 1;
    }
    _setFilterValues(val);
    updateSessionQueryFilterValues(val);
    setExpandedRows([]);
  };

  const onPageNumberChange = newPageNumber => {
    const oldPageNumber = filterValues.pageNumber;
    const rollingPageNumberMod = Math.floor(101 / filterValues.resultsPerPage);
    const rollingPageNumber = oldPageNumber % rollingPageNumberMod;
    const isNextPage = newPageNumber > oldPageNumber;
    const hasNextPage = Math.max(rollingPageNumber, 1) * resultsPerPage < numOfWorkitems;
    if (isNextPage && !hasNextPage) {
      return;
    }
    setFilterValues({ ...filterValues, pageNumber: newPageNumber });
  };

  const onResultsPerPageChange = newResultsPerPage => {
    setFilterValues({
      ...filterValues,
      pageNumber: 1,
      resultsPerPage: Number(newResultsPerPage),
    });
  };

  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  // Query for series information when a row is expanded
  useEffect(() => {
    const fetchSeries = async studyInstanceUid => {
      try {
        const series = await dataSource.query.series.search(studyInstanceUid);
        seriesInStudiesMap.set(studyInstanceUid, sortBySeriesDate(series));
        setStudiesWithSeriesData(prev => [...prev, studyInstanceUid]);
      } catch (ex) {
        console.warn(ex);
      }
    };

    for (let z = 0; z < expandedRows.length; z++) {
      const expandedRowIndex = expandedRows[z] - 1;
      const workitem = sortedWorkitems[expandedRowIndex];
      const studyInstanceUid = workitem?.studyInstanceUid;
      if (!studyInstanceUid || studiesWithSeriesData.includes(studyInstanceUid)) {
        continue;
      }
      fetchSeries(studyInstanceUid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedRows, workitems]);

  // Sync URL query parameters with filter state
  useEffect(() => {
    if (!debouncedFilterValues) {
      return;
    }
    const queryString = {};
    Object.keys(defaultFilterValues).forEach(key => {
      const defaultValue = defaultFilterValues[key];
      const currValue = debouncedFilterValues[key];
      if (key === 'studyDate') {
        if (currValue.startDate && defaultValue.startDate !== currValue.startDate) {
          queryString.startDate = currValue.startDate;
        }
        if (currValue.endDate && defaultValue.endDate !== currValue.endDate) {
          queryString.endDate = currValue.endDate;
        }
      } else if (key === 'modalities' && currValue.length) {
        queryString.modalities = currValue.join(',');
      } else if (key === 'priority' && currValue.length) {
        queryString.priority = currValue.join(',');
      } else if (key === 'procedureStepState' && currValue.length) {
        queryString.procedureStepState = currValue.join(',');
      } else if (currValue !== defaultValue) {
        queryString[key] = currValue;
      }
    });

    preserveQueryStrings(queryString);

    const search = qs.stringify(queryString, {
      skipNull: true,
      skipEmptyString: true,
    });
    navigate({
      pathname: '/workitems',
      search: search ? `?${search}` : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilterValues]);

  const isFiltering = (filterValues, defaultFilterValues) => {
    return !isEqual(filterValues, defaultFilterValues);
  };

  const rollingPageNumberMod = Math.floor(101 / resultsPerPage);
  const rollingPageNumber = (pageNumber - 1) % rollingPageNumberMod;
  const offset = resultsPerPage * rollingPageNumber;
  const offsetAndTake = offset + resultsPerPage;

  const tableDataSource = sortedWorkitems.map((workitem, key) => {
    const rowKey = key + 1;
    const isExpanded = expandedRows.some(k => k === rowKey);
    const {
      studyInstanceUid,
      priority,
      modalities,
      description,
      mrn,
      patientName,
      date,
      time,
      procedureStepState,
      institutionName,
      stationClass,
      _rawDicom,
    } = workitem;

    // UPS SOP Instance UID (tag 00080018) is needed for state-change requests.
    // studyInstanceUid holds tag 0020000D and is kept for study launch only.
    const workitemUid: string =
      (_rawDicom?.['00080018']?.Value?.[0] as string | undefined) ??
      studyInstanceUid ??
      String(key);

    // Determine if this workitem is assigned to the configured performer AE title.
    // Used only for SCHEDULED items (Reject button gate).
    const scheduledPerformerAe: string | undefined =
      _rawDicom?.['00404025']?.Value?.[0]?.['00080100']?.Value?.[0];
    const isAssignedToMe = !!performerAeTitle && scheduledPerformerAe === performerAeTitle;

    // For IN PROGRESS items, show Complete/Cancel whenever performerAeTitle is
    // configured. The 00404025 sequence is not reliably returned by dcm4chee-arc
    // in search results, so we cannot use isAssignedToMe as the gate here.
    // The DICOM server enforces ownership via Transaction UID server-side.
    const claimedByMe =
      !!performerAeTitle && (procedureStepState ?? '').toUpperCase() === 'IN PROGRESS';

    const actionState = getActionState(workitemUid);

    const scheduledDate =
      date &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD'], true).isValid() &&
      moment(date, ['YYYYMMDD', 'YYYY.MM.DD']).format(t('Common:localDateFormat', 'MMM-DD-YYYY'));

    const scheduledTime =
      time &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).isValid() &&
      moment(time, ['HH', 'HHmm', 'HHmmss', 'HHmmss.SSS']).format(
        t('Common:localTimeFormat', 'hh:mm A')
      );

    const makeCopyTooltipCell = textValue => {
      if (!textValue) {
        return '';
      }
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-pointer truncate">{textValue}</span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="flex items-center justify-between gap-2">
              {textValue}
              <Clipboard>{textValue}</Clipboard>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    };

    const stateColorClass =
      STEP_STATE_COLORS[(procedureStepState ?? '').toUpperCase()] ?? 'text-white';

    return {
      dataCY: `workitemRow-${studyInstanceUid || key}`,
      clickableCY: studyInstanceUid || String(key),
      row: [
        {
          key: 'patientName',
          content: patientName ? makeCopyTooltipCell(patientName) : null,
          gridCol: 4,
        },
        {
          key: 'mrn',
          content: makeCopyTooltipCell(mrn),
          gridCol: 2,
        },
        {
          key: 'scheduledDate',
          content: (
            <>
              {scheduledDate && <span className="mr-4">{scheduledDate}</span>}
              {scheduledTime && <span>{scheduledTime}</span>}
            </>
          ),
          title: `${scheduledDate || ''} ${scheduledTime || ''}`,
          gridCol: 4,
        },
        {
          key: 'description',
          content: makeCopyTooltipCell(description),
          gridCol: 3,
        },
        {
          key: 'modality',
          content: modalities,
          title: modalities,
          gridCol: 2,
        },
        {
          key: 'priority',
          content: priority ? <span className="font-semibold">{priority}</span> : null,
          title: priority || '',
          gridCol: 1,
        },
        {
          key: 'procedureStepState',
          content: (
            <span className={classnames('font-semibold', stateColorClass)}>
              {procedureStepState || ''}
            </span>
          ),
          title: procedureStepState || '',
          gridCol: 3,
        },
        {
          key: 'actions',
          content: (
            <WorkItemActionsPanel
              uid={workitemUid}
              procedureStepState={procedureStepState as any}
              isAssignedToMe={isAssignedToMe}
              claimedByMe={claimedByMe}
              actionState={actionState}
              onClaim={claim}
              onComplete={complete}
              onCancel={uid => {
                show({
                  content: CancelWorkitemModal,
                  contentProps: {
                    onConfirm: (reason?: string) => cancel(uid, reason),
                    onClose: () => {},
                  },
                  title: 'Cancel Workitem',
                  containerClassName: 'max-w-md',
                });
              }}
              onReject={reject}
            />
          ),
          gridCol: 4,
        },
        {
          key: 'details',
          content: _rawDicom ? (
            <button
              className="text-primary-active hover:text-white"
              title="View DICOM attributes"
              onClick={event => {
                event.stopPropagation();
                show({
                  content: WorkItemDetailsModal,
                  contentProps: { rawDicom: _rawDicom },
                  title: `Work Item Attributes${patientName ? ' — ' + patientName : ''}`,
                  containerClassName: 'max-w-3xl',
                });
              }}
            >
              <Icons.DicomTagBrowser className="h-5 w-5" />
            </button>
          ) : null,
          gridCol: 1,
        },
      ],
      expandedContent: (
        <StudyListExpandedRow
          seriesTableColumns={{
            description: t('StudyList:Description'),
            seriesNumber: t('StudyList:Series'),
            modality: t('StudyList:Modality'),
            instances: t('StudyList:Instances'),
          }}
          seriesTableDataSource={
            seriesInStudiesMap.has(studyInstanceUid)
              ? seriesInStudiesMap.get(studyInstanceUid).map(s => ({
                  description: s.description || '(empty)',
                  seriesNumber: s.seriesNumber ?? '',
                  modality: s.modality || '',
                  instances: s.numSeriesInstances || '',
                }))
              : []
          }
        >
          {/* Workitem metadata details */}
          {(institutionName || stationClass) && (
            <div className="mb-4 flex flex-row flex-wrap gap-6 text-sm text-white">
              {institutionName && (
                <div>
                  <span className="text-secondary-light mr-2">Institution:</span>
                  <span>{institutionName}</span>
                </div>
              )}
              {stationClass && (
                <div>
                  <span className="text-secondary-light mr-2">Station Class:</span>
                  <span>{stationClass}</span>
                </div>
              )}
            </div>
          )}
          {/* Mode launch buttons – only available when the workitem references a study */}
          {studyInstanceUid && (
            <div className="flex flex-row gap-2">
              {(appConfig.groupEnabledModesFirst
                ? appConfig.loadedModes.sort((a, b) => {
                    const isValidA = a.isValidMode({
                      modalities: (modalities ?? '').replaceAll('/', '\\'),
                      study: workitem,
                    }).valid;
                    const isValidB = b.isValidMode({
                      modalities: (modalities ?? '').replaceAll('/', '\\'),
                      study: workitem,
                    }).valid;
                    return isValidB - isValidA;
                  })
                : appConfig.loadedModes
              ).map((mode, i) => {
                if (mode.hide) {
                  return null;
                }
                const modalitiesToCheck = (modalities ?? '').replaceAll('/', '\\');
                const { valid: isValidMode, description: invalidModeDescription } =
                  mode.isValidMode({
                    modalities: modalitiesToCheck,
                    study: workitem,
                  });
                if (isValidMode === null) {
                  return null;
                }
                const query = new URLSearchParams();
                if (filterValues.configUrl) {
                  query.append('configUrl', filterValues.configUrl);
                }
                query.append('StudyInstanceUIDs', studyInstanceUid);
                query.append('returnTo', '/workitems');
                preserveQueryParameters(query);

                return (
                  mode.displayName && (
                    <Link
                      className={isValidMode ? '' : 'cursor-not-allowed'}
                      key={i}
                      to={`/${mode.routeName}${dataPath || ''}?${query.toString()}`}
                      onClick={event => {
                        if (!isValidMode) {
                          event.preventDefault();
                        }
                      }}
                    >
                      <Button
                        type={ButtonEnums.type.primary}
                        size={ButtonEnums.size.smallTall}
                        disabled={!isValidMode}
                        startIconTooltip={
                          !isValidMode ? (
                            <div className="font-inter flex w-[206px] whitespace-normal text-left text-xs font-normal text-white">
                              {invalidModeDescription}
                            </div>
                          ) : null
                        }
                        startIcon={
                          isValidMode ? (
                            <Icons.LaunchArrow className="!h-[20px] !w-[20px] text-black" />
                          ) : (
                            <Icons.LaunchInfo className="!h-[20px] !w-[20px] text-black" />
                          )
                        }
                        onClick={() => {}}
                        dataCY={`mode-${mode.routeName}-${studyInstanceUid}`}
                        className={!isValidMode && 'bg-[#222d44]'}
                      >
                        {mode.displayName}
                      </Button>
                    </Link>
                  )
                );
              })}
            </div>
          )}
        </StudyListExpandedRow>
      ),
      onClickRow: () =>
        setExpandedRows(s => (isExpanded ? s.filter(n => rowKey !== n) : [...s, rowKey])),
      isExpanded,
    };
  });

  const hasWorkitems = numOfWorkitems > 0;

  const AboutModal = customizationService.getCustomization(
    'ohif.aboutModal'
  ) as coreTypes.MenuComponentCustomization;
  const UserPreferencesModal = customizationService.getCustomization(
    'ohif.userPreferencesModal'
  ) as coreTypes.MenuComponentCustomization;

  const menuOptions = [
    {
      title: AboutModal?.menuTitle ?? t('Header:About'),
      icon: 'info',
      onClick: () =>
        show({
          content: AboutModal,
          title: AboutModal?.title ?? t('AboutModal:About OHIF Viewer'),
          containerClassName: AboutModal?.containerClassName ?? 'max-w-md',
        }),
    },
    {
      title: UserPreferencesModal.menuTitle ?? t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          content: UserPreferencesModal as React.ComponentType,
          title: UserPreferencesModal.title ?? t('UserPreferencesModal:User preferences'),
          containerClassName:
            UserPreferencesModal?.containerClassName ?? 'flex max-w-4xl p-6 flex-col',
        }),
    },
  ];

  if (appConfig.oidc) {
    menuOptions.push({
      icon: 'power-off',
      title: t('Header:Logout'),
      onClick: () => {
        navigate(`/logout?redirect_uri=${encodeURIComponent(window.location.href)}`);
      },
    });
  }

  const LoadingIndicatorProgress = customizationService.getCustomization(
    'ui.loadingIndicatorProgress'
  );

  const dataSourceConfigurationComponent = customizationService.getCustomization(
    'ohif.dataSourceConfigurationComponent'
  );

  return (
    <div className="flex h-screen flex-col bg-black">
      <Header
        isSticky
        menuOptions={menuOptions}
        isReturnEnabled={false}
        WhiteLabeling={appConfig.whiteLabeling}
        showPatientInfo={PatientInfoVisibility.DISABLED}
      />
      <Onboarding />
      <InvestigationalUseDialog dialogConfiguration={appConfig?.investigationalUseDialog} />
      <div className="flex h-full flex-col overflow-y-auto">
        <ScrollArea>
          <div className="flex grow flex-col">
            <StudyListFilter
              numOfStudies={pageNumber * resultsPerPage > 100 ? 101 : numOfWorkitems}
              filtersMeta={filtersMeta}
              filterValues={{ ...filterValues, ...defaultSortValues }}
              onChange={setFilterValues}
              clearFilters={() => setFilterValues(defaultFilterValues)}
              isFiltering={isFiltering(filterValues, defaultFilterValues)}
              getDataSourceConfigurationComponent={
                dataSourceConfigurationComponent
                  ? () => dataSourceConfigurationComponent()
                  : undefined
              }
              listTitle="Work Items"
              listCountLabel="Work Items"
            />
          </div>
          {hasWorkitems ? (
            <div className="flex grow flex-col">
              <StudyListTable
                tableDataSource={tableDataSource.slice(offset, offsetAndTake)}
                numOfStudies={numOfWorkitems}
                querying={querying}
                filtersMeta={filtersMeta}
              />
              <div className="grow">
                <StudyListPagination
                  onChangePage={onPageNumberChange}
                  onChangePerPage={onResultsPerPageChange}
                  currentPage={pageNumber}
                  perPage={resultsPerPage}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center pt-48">
              {appConfig.showLoadingIndicator && isLoadingData ? (
                <LoadingIndicatorProgress className={'h-full w-full bg-black'} />
              ) : (
                <EmptyStudies />
              )}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

WorkItemsList.propTypes = {
  data: PropTypes.array.isRequired,
  dataSource: PropTypes.shape({
    query: PropTypes.object.isRequired,
    getConfig: PropTypes.func,
  }).isRequired,
  isLoadingData: PropTypes.bool.isRequired,
  servicesManager: PropTypes.object.isRequired,
};

const defaultFilterValues = {
  patientName: '',
  mrn: '',
  studyDate: {
    startDate: null,
    endDate: null,
  },
  description: '',
  modalities: [],
  priority: [],
  procedureStepState: [],
  sortBy: '',
  sortDirection: 'none',
  pageNumber: 1,
  resultsPerPage: 25,
  datasources: '',
};

function _tryParseInt(str, defaultValue) {
  let retValue = defaultValue;
  if (str && str.length > 0) {
    if (!isNaN(str)) {
      retValue = parseInt(str);
    }
  }
  return retValue;
}

function _getQueryFilterValues(params) {
  const newParams = new URLSearchParams();
  for (const [key, value] of params) {
    newParams.set(key.toLowerCase(), value);
  }
  params = newParams;

  const queryFilterValues = {
    patientName: params.get('patientname'),
    mrn: params.get('mrn'),
    studyDate: {
      startDate: params.get('startdate') || null,
      endDate: params.get('enddate') || null,
    },
    description: params.get('description'),
    modalities: params.get('modalities') ? params.get('modalities').split(',') : [],
    priority: params.get('priority') ? params.get('priority').split(',') : [],
    procedureStepState: params.get('procedurestepstate')
      ? params.get('procedurestepstate').split(',')
      : [],
    sortBy: params.get('sortby'),
    sortDirection: params.get('sortdirection'),
    pageNumber: _tryParseInt(params.get('pagenumber'), undefined),
    resultsPerPage: _tryParseInt(params.get('resultsperpage'), undefined),
    datasources: params.get('datasources'),
    configUrl: params.get('configurl'),
  };

  // Delete null/undefined keys
  Object.keys(queryFilterValues).forEach(
    key => queryFilterValues[key] == null && delete queryFilterValues[key]
  );

  return queryFilterValues;
}

function _sortStringDates(s1, s2, sortModifier) {
  const s1Date = moment(s1.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);
  const s2Date = moment(s2.date, ['YYYYMMDD', 'YYYY.MM.DD'], true);

  if (s1Date.isValid() && s2Date.isValid()) {
    return (s1Date.toISOString() > s2Date.toISOString() ? 1 : -1) * sortModifier;
  } else if (s1Date.isValid()) {
    return sortModifier;
  } else if (s2Date.isValid()) {
    return -1 * sortModifier;
  }
}

export default WorkItemsList;
