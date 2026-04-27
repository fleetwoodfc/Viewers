import { createDicomWebApi }       from './DicomWebDataSource/index';
import { createDicomJSONApi }      from './DicomJSONDataSource/index';
import { createDicomLocalApi }     from './DicomLocalDataSource/index';
import { createDicomWebProxyApi }  from './DicomWebProxyDataSource/index';
import { createMergeDataSourceApi} from './MergeDataSource/index';
import { createDicomWebUpsApi }    from './DicomWebUpsDataSource/index'; // NEW

function getDataSourcesModule() {
  return [
    { name: 'dicomweb',      type: 'webApi',   createDataSource: createDicomWebApi },
    { name: 'dicomwebproxy', type: 'webApi',   createDataSource: createDicomWebProxyApi },
    { name: 'dicomjson',     type: 'jsonApi',  createDataSource: createDicomJSONApi },
    { name: 'dicomlocal',    type: 'localApi', createDataSource: createDicomLocalApi },
    { name: 'merge',         type: 'mergeApi', createDataSource: createMergeDataSourceApi },
    { name: 'dicomwebups',   type: 'webApi',   createDataSource: createDicomWebUpsApi }, // NEW
  ];
}

export default getDataSourcesModule;