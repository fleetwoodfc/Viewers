/* eslint-disable react/jsx-props-no-spreading */
import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { ExtensionManager, MODULE_TYPES } from '@ohif/core';
import { extensionManager } from '../App';
import { useParams, useLocation } from 'react-router';
import { useNavigate } from 'react-router-dom';
import useSearchParams from '../../hooks/useSearchParams';
import { EmptyStudies } from '@ohif/ui';

/**
 * Lightweight wrapper parallel to DataSourceWrapper.tsx.
 * Manages data source initialisation and UPS workitem fetching,
 * then passes results down to UPSWorkList (or another child layout).
 */
function UPSDataSourceWrapper(props: withAppTypes) {
  const { servicesManager } = props;
  const navigate = useNavigate();
  const { children: LayoutTemplate, ...rest } = props;
  const params = useParams();
  const location = useLocation();
  const lowerCaseSearchParams = useSearchParams({ lowerCaseKeys: true });
  const query = useSearchParams();

  const DEFAULT_DATA = {
    workitems: [],
    total: 0,
    resultsPerPage: 25,
    pageNumber: 1,
  };

  const getInitialDataSourceName = useCallback(() => {
    let dataSourceName = lowerCaseSearchParams.get('datasources');

    if (!dataSourceName && window.config.defaultDataSourceName) {
      return '';
    }

    if (!dataSourceName) {
      const dataSourceModules = extensionManager.modules[MODULE_TYPES.DATA_SOURCE];
      const webApiDataSources = dataSourceModules.reduce((acc, curr) => {
        const mods: any[] = [];
        curr.module.forEach((mod: any) => {
          if (mod.type === 'webApi') {
            mods.push(mod);
          }
        });
        return acc.concat(mods);
      }, [] as any[]);
      dataSourceName = webApiDataSources
        .map((ds: any) => ds.name)
        .find((it: string) => extensionManager.getDataSources(it)?.[0] !== undefined);
    }

    return dataSourceName;
  }, []);

  const [isDataSourceInitialized, setIsDataSourceInitialized] = useState(false);

  const [dataSource, setDataSource] = useState(() => {
    const dataSourceName = getInitialDataSourceName();

    if (!dataSourceName) {
      return extensionManager.getActiveDataSource()[0];
    }

    const ds = extensionManager.getDataSources(dataSourceName)?.[0];
    if (!ds) {
      throw new Error(`No data source found for ${dataSourceName}`);
    }

    return ds;
  });

  const [data, setData] = useState(DEFAULT_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const initializeDataSource = async () => {
      await dataSource.initialize({ params, query });
      setIsDataSourceInitialized(true);
    };
    initializeDataSource();
  }, [dataSource]);

  useEffect(() => {
    const dataSourceChangedCallback = () => {
      setIsLoading(false);
      setIsDataSourceInitialized(false);
      setDataSource(extensionManager.getActiveDataSource()[0]);
      setData(DEFAULT_DATA);
    };

    const sub = extensionManager.subscribe(
      ExtensionManager.EVENTS.ACTIVE_DATA_SOURCE_CHANGED,
      dataSourceChangedCallback
    );
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isDataSourceInitialized) {
      return;
    }

    // Graceful degradation: data source may not support UPS workitems
    if (!dataSource.query?.workitems?.search) {
      return;
    }

    const queryFilterValues = _getQueryFilterValues(location.search);

    async function getData() {
      setIsLoading(true);
      try {
        const workitems = await dataSource.query.workitems.search(queryFilterValues);
        setData({
          workitems: workitems || [],
          total: (workitems || []).length,
          resultsPerPage: queryFilterValues.resultsPerPage,
          pageNumber: queryFilterValues.pageNumber,
        });
      } catch (e) {
        console.error(e);
        servicesManager.services.uiModalService.show({
          title: 'UPS Data Source Error',
          content: () => (
            <div className="text-foreground">
              <p className="text-red-600">Error: {(e as Error).message}</p>
              <p>Failed to fetch UPS workitems. Please check your data source configuration.</p>
            </div>
          ),
        });
        setData(DEFAULT_DATA);
      } finally {
        setIsLoading(false);
      }
    }

    getData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, isDataSourceInitialized, dataSource, refreshKey]);

  // If the data source doesn't support workitems, show a user-friendly message
  if (isDataSourceInitialized && !dataSource.query?.workitems) {
    return (
      <div className="text-foreground flex h-full flex-col items-center justify-center bg-black">
        <EmptyStudies />
        <p className="text-secondary-light mt-4 text-sm">
          This data source does not support UPS workitems.
        </p>
      </div>
    );
  }

  return (
    <LayoutTemplate
      {...rest}
      data={data.workitems}
      dataTotal={data.total}
      dataSource={dataSource}
      isLoadingData={isLoading}
      onRefresh={() => setRefreshKey(k => k + 1)}
    />
  );
}

UPSDataSourceWrapper.propTypes = {
  children: PropTypes.oneOfType([PropTypes.element, PropTypes.func]).isRequired,
};

export default UPSDataSourceWrapper;

function _tryParseInt(str: string | null, defaultValue: number): number {
  if (str && str.length > 0 && !isNaN(Number(str))) {
    return parseInt(str, 10);
  }
  return defaultValue;
}

function _getQueryFilterValues(search: string) {
  const query = new URLSearchParams(search);
  const newParams = new URLSearchParams();
  for (const [key, value] of query) {
    newParams.set(key.toLowerCase(), value);
  }

  return {
    patientName: newParams.get('patientname') || undefined,
    patientId: newParams.get('patientid') || undefined,
    procedureStepLabel: newParams.get('procedurestabl') || undefined,
    procedureStepState: newParams.get('procedurestate') || undefined,
    pageNumber: _tryParseInt(newParams.get('pagenumber'), 1),
    resultsPerPage: _tryParseInt(newParams.get('resultsperpage'), 25),
  };
}
