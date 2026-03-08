import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import moment from 'moment';
import qs from 'query-string';
import { useTranslation } from 'react-i18next';
import { Types as coreTypes } from '@ohif/core';

import { StudyListPagination, EmptyStudies } from '@ohif/ui';

import {
  Header,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  Clipboard,
  useModal,
  Onboarding,
  ScrollArea,
  InvestigationalUseDialog,
} from '@ohif/ui-next';

import { useAppConfig } from '@state';
import { useDebounce, useSearchParams } from '../../hooks';
import upsWorkListFiltersMeta from './upsWorkListFiltersMeta';

/** Default filter values — used for reset and URL-sync logic */
const defaultFilterValues = {
  patientName: '',
  patientId: '',
  procedureStepLabel: '',
  procedureStepState: '',
  pageNumber: 1,
  resultsPerPage: 25,
};

/** Status badge colour classes by procedure step state */
const statusBadgeClass: Record<string, string> = {
  SCHEDULED: 'bg-blue-700 text-white rounded px-1 text-xs',
  'IN PROGRESS': 'bg-yellow-600 text-black rounded px-1 text-xs',
  COMPLETED: 'bg-green-700 text-white rounded px-1 text-xs',
  CANCELED: 'bg-gray-600 text-white rounded px-1 text-xs',
};

function _tryParseInt(str: string | null, defaultValue: number): number {
  if (str && str.length > 0 && !isNaN(Number(str))) {
    return parseInt(str, 10);
  }
  return defaultValue;
}

function _getQueryFilterValues(params: URLSearchParams) {
  const newParams = new URLSearchParams();
  for (const [key, value] of params) {
    newParams.set(key.toLowerCase(), value);
  }

  const queryFilterValues = {
    patientName: newParams.get('patientname') ?? '',
    patientId: newParams.get('patientid') ?? '',
    procedureStepLabel: newParams.get('procedurestabl') ?? '',
    procedureStepState: newParams.get('procedurestate') ?? '',
    pageNumber: _tryParseInt(newParams.get('pagenumber'), 1),
    resultsPerPage: _tryParseInt(newParams.get('resultsperpage'), 25),
  };

  return queryFilterValues;
}

/**
 * UPS Worklist page component.
 *
 * Accepts the same core props as WorkList.tsx for consistency:
 *   data, dataTotal, isLoadingData, dataSource, onRefresh, servicesManager
 */
function UPSWorkList({
  data: workitems,
  dataTotal: workitemsTotal,
  isLoadingData,
  dataSource,
  onRefresh,
  servicesManager,
}: withAppTypes) {
  const { show } = useModal();
  const { t } = useTranslation();
  const [appConfig] = useAppConfig();
  const searchParams = useSearchParams();
  const navigate = useNavigate();

  const queryFilterValues = _getQueryFilterValues(searchParams);

  const [filterValues, _setFilterValues] = useState({
    ...defaultFilterValues,
    ...queryFilterValues,
  });

  const debouncedFilterValues = useDebounce(filterValues, 200);
  const { resultsPerPage, pageNumber } = filterValues;

  const setFilterValues = (val: typeof filterValues) => {
    if (filterValues.pageNumber === val.pageNumber) {
      val.pageNumber = 1;
    }
    _setFilterValues(val);
  };

  const onPageNumberChange = (newPageNumber: number) => {
    setFilterValues({ ...filterValues, pageNumber: newPageNumber });
  };

  const onResultsPerPageChange = (newResultsPerPage: string | number) => {
    setFilterValues({
      ...filterValues,
      pageNumber: 1,
      resultsPerPage: Number(newResultsPerPage),
    });
  };

  // Set body background
  useEffect(() => {
    document.body.classList.add('bg-black');
    return () => {
      document.body.classList.remove('bg-black');
    };
  }, []);

  // Sync URL query parameters with current filter state
  useEffect(() => {
    if (!debouncedFilterValues) {
      return;
    }

    const queryString: Record<string, string | number> = {};
    if (debouncedFilterValues.patientName) {
      queryString.patientname = debouncedFilterValues.patientName;
    }
    if (debouncedFilterValues.patientId) {
      queryString.patientid = debouncedFilterValues.patientId;
    }
    if (debouncedFilterValues.procedureStepLabel) {
      queryString.procedurestabl = debouncedFilterValues.procedureStepLabel;
    }
    if (debouncedFilterValues.procedureStepState) {
      queryString.procedurestate = debouncedFilterValues.procedureStepState;
    }
    if (debouncedFilterValues.pageNumber !== 1) {
      queryString.pagenumber = debouncedFilterValues.pageNumber;
    }
    if (debouncedFilterValues.resultsPerPage !== 25) {
      queryString.resultsperpage = debouncedFilterValues.resultsPerPage;
    }

    const search = qs.stringify(queryString, {
      skipNull: true,
      skipEmptyString: true,
    });
    navigate({
      pathname: '/upsworklist',
      search: search ? `?${search}` : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilterValues]);

  // Apply client-side filtering to the provided workitems array
  const filteredWorkitems = useMemo(() => {
    const items = (workitems as any[]) || [];
    if (!items.length) {
      return [];
    }
    return items.filter(item => {
      const lowerName = (item.patientName || '').toLowerCase();
      const lowerFilter = (filterValues.patientName || '').toLowerCase();
      if (lowerFilter && !lowerName.includes(lowerFilter)) {
        return false;
      }
      const lowerId = (item.patientId || '').toLowerCase();
      const lowerIdFilter = (filterValues.patientId || '').toLowerCase();
      if (lowerIdFilter && !lowerId.includes(lowerIdFilter)) {
        return false;
      }
      const lowerLabel = (item.procedureStepLabel || '').toLowerCase();
      const lowerLabelFilter = (filterValues.procedureStepLabel || '').toLowerCase();
      if (lowerLabelFilter && !lowerLabel.includes(lowerLabelFilter)) {
        return false;
      }
      if (
        filterValues.procedureStepState &&
        item.procedureStepState !== filterValues.procedureStepState
      ) {
        return false;
      }
      return true;
    });
  }, [workitems, filterValues]);

  // Pagination slice
  const offset = (pageNumber - 1) * resultsPerPage;
  const pagedWorkitems = filteredWorkitems.slice(offset, offset + resultsPerPage);
  const numOfWorkitems = filteredWorkitems.length;
  const hasWorkitems = numOfWorkitems > 0;

  /** Renders a cell with a copy-to-clipboard tooltip */
  const makeCopyTooltipCell = (textValue: string) => {
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

  const { customizationService } = servicesManager.services;

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
      title: UserPreferencesModal?.menuTitle ?? t('Header:Preferences'),
      icon: 'settings',
      onClick: () =>
        show({
          content: UserPreferencesModal as React.ComponentType,
          title: UserPreferencesModal?.title ?? t('UserPreferencesModal:User preferences'),
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

  /** Column header labels aligned with upsWorkListFiltersMeta grid widths */
  const columnHeaders = [
    { label: 'Patient Name', gridCol: 4 },
    { label: 'Patient ID', gridCol: 3 },
    { label: 'Step Label', gridCol: 5 },
    { label: 'Status', gridCol: 3 },
    { label: 'Scheduled Date/Time', gridCol: 5 },
    { label: 'Accession #', gridCol: 3 },
    { label: 'Input Readiness', gridCol: 5 },
  ];

  const totalGridCols = columnHeaders.reduce((sum, col) => sum + col.gridCol, 0);

  return (
    <div className="flex h-screen flex-col bg-black">
      <Header
        isSticky
        menuOptions={menuOptions}
        isReturnEnabled={false}
        WhiteLabeling={appConfig.whiteLabeling}
      />
      <Onboarding />
      <InvestigationalUseDialog dialogConfiguration={appConfig?.investigationalUseDialog} />
      <div className="flex h-full flex-col overflow-y-auto">
        <ScrollArea>
          {/* Filter bar */}
          <div className="bg-primary-dark flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-foreground text-xl font-semibold">UPS Worklist</h2>
              <button
                className="bg-primary hover:bg-primary/80 rounded px-3 py-1 text-sm text-white"
                onClick={onRefresh}
              >
                Refresh
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Patient Name filter */}
              <div className="flex flex-col">
                <label className="text-secondary-light mb-1 text-xs">Patient Name</label>
                <input
                  className="bg-secondary-dark text-foreground rounded border border-gray-600 px-2 py-1 text-sm focus:outline-none"
                  type="text"
                  value={filterValues.patientName}
                  onChange={e =>
                    setFilterValues({ ...filterValues, patientName: e.target.value })
                  }
                  placeholder="Filter by name…"
                />
              </div>
              {/* Patient ID filter */}
              <div className="flex flex-col">
                <label className="text-secondary-light mb-1 text-xs">Patient ID / MRN</label>
                <input
                  className="bg-secondary-dark text-foreground rounded border border-gray-600 px-2 py-1 text-sm focus:outline-none"
                  type="text"
                  value={filterValues.patientId}
                  onChange={e => setFilterValues({ ...filterValues, patientId: e.target.value })}
                  placeholder="Filter by MRN…"
                />
              </div>
              {/* Step Label filter */}
              <div className="flex flex-col">
                <label className="text-secondary-light mb-1 text-xs">Step Label</label>
                <input
                  className="bg-secondary-dark text-foreground rounded border border-gray-600 px-2 py-1 text-sm focus:outline-none"
                  type="text"
                  value={filterValues.procedureStepLabel}
                  onChange={e =>
                    setFilterValues({ ...filterValues, procedureStepLabel: e.target.value })
                  }
                  placeholder="Filter by label…"
                />
              </div>
              {/* Procedure Step State filter */}
              <div className="flex flex-col">
                <label className="text-secondary-light mb-1 text-xs">State</label>
                <select
                  className="bg-secondary-dark text-foreground rounded border border-gray-600 px-2 py-1 text-sm focus:outline-none"
                  value={filterValues.procedureStepState}
                  onChange={e =>
                    setFilterValues({ ...filterValues, procedureStepState: e.target.value })
                  }
                >
                  {upsWorkListFiltersMeta
                    .find(f => f.name === 'procedureStepState')
                    ?.inputProps?.options?.map((opt: { value: string; label: string }) => (
                      <option
                        key={opt.value}
                        value={opt.value}
                      >
                        {opt.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          {hasWorkitems ? (
            <div className="flex grow flex-col">
              {/* Column headers */}
              <div
                className="bg-secondary-dark text-secondary-light grid border-b border-gray-700 px-4 py-2 text-xs font-semibold uppercase"
                style={{
                  gridTemplateColumns: columnHeaders
                    .map(c => `${c.gridCol}fr`)
                    .join(' '),
                }}
              >
                {columnHeaders.map(col => (
                  <div key={col.label}>{col.label}</div>
                ))}
              </div>

              {/* Rows */}
              {pagedWorkitems.map((item, idx) => {
                const formattedDateTime =
                  item.scheduledDateTime
                    ? moment(item.scheduledDateTime, 'YYYYMMDDHHmmss.SSSSSS').isValid()
                      ? moment(item.scheduledDateTime, 'YYYYMMDDHHmmss.SSSSSS').format(
                          'MMM DD, YYYY HH:mm'
                        )
                      : item.scheduledDateTime
                    : '';

                const badgeClass =
                  statusBadgeClass[item.procedureStepState] ||
                  'bg-gray-600 text-white rounded px-1 text-xs';

                return (
                  <div
                    key={item.workitemUid || idx}
                    className="text-foreground hover:bg-secondary-dark/60 grid border-b border-gray-800 px-4 py-2 text-sm"
                    style={{
                      gridTemplateColumns: columnHeaders
                        .map(c => `${c.gridCol}fr`)
                        .join(' '),
                    }}
                  >
                    <div className="truncate">{makeCopyTooltipCell(item.patientName)}</div>
                    <div className="truncate">{makeCopyTooltipCell(item.patientId)}</div>
                    <div className="truncate">{makeCopyTooltipCell(item.procedureStepLabel)}</div>
                    <div>
                      {item.procedureStepState && (
                        <span className={badgeClass}>{item.procedureStepState}</span>
                      )}
                    </div>
                    <div>{formattedDateTime}</div>
                    <div className="truncate">{makeCopyTooltipCell(item.accessionNumber)}</div>
                    <div>
                      {item.inputReadinessState && (
                        <span className="rounded bg-gray-700 px-1 text-xs text-white">
                          {item.inputReadinessState}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
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
                <LoadingIndicatorProgress className="h-full w-full bg-black" />
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

export default UPSWorkList;
