/** @type {AppTypes.Config} */
window.config = {
  routerBasename: null,
  showStudyList: true,
  extensions: [],
  modes: [],
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  defaultDataSourceName: 'ups',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Dcm4chee Server',
        name: 'Dcm4chee',
        wadoUriRoot: '/dcm4chee-arc/aets/DCM4CHEE/wado',
        qidoRoot: '/dcm4chee-arc/aets/DCM4CHEE/rs',
        wadoRoot: '/dcm4chee-arc/aets/DCM4CHEE/rs',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        dicomUploadEnabled: true,
        omitQuotationForMultipartRequest: true,
      },
    },
{
  namespace: '@ohif/extension-default.dataSourcesModule.dicomwebups',
  sourceName: 'ups',
  configuration: {
    friendlyName: 'UPS-RS Worklist',
    name: 'UPS',
    upsRoot: '/dcm4chee-arc/aets/WORKLIST/rs',   // UPS-RS endpoint (workitem queries)
    qidoRoot: '/dcm4chee-arc/aets/DCM4CHEE/rs',  // QIDO-RS endpoint (series/instances)
    wadoRoot: '/dcm4chee-arc/aets/DCM4CHEE/rs',  // WADO-RS endpoint (retrieve)
    supportsFuzzyMatching: true,
    supportsWildcard: true,
    omitQuotationForMultipartRequest: true,
  },
},
  ],
};
