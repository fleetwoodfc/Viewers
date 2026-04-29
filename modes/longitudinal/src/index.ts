import i18n from 'i18next';
import { id } from './id';
import { initToolGroups, toolbarButtons, cornerstone,
  ohif,
  dicomsr,
  dicomvideo,
  basicLayout,
  basicRoute,
  extensionDependencies as basicDependencies,
  mode as basicMode,
  modeInstance as basicModeInstance,
 } from '@ohif/mode-basic';

export const tracked = {
  measurements: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked',
};

export const extensionDependencies = {
  // Can derive the versions at least process.env.from npm_package_version
  ...basicDependencies,
  '@ohif/extension-measurement-tracking': '^3.0.0',
};

export const longitudinalInstance = {
  ...basicLayout,
  id: ohif.layout,
  props: {
    ...basicLayout.props,
    leftPanels: [tracked.thumbnailList],
    rightPanels: [cornerstone.segmentation, tracked.measurements],
    viewports: [
      {
        namespace: tracked.viewport,
        // Re-use the display sets from basic
        displaySetsToDisplay: basicLayout.props.viewports[0].displaySetsToDisplay,
      },
      ...basicLayout.props.viewports,
      ],
    }
  };


export const longitudinalRoute =
    {
      ...basicRoute,
      path: 'longitudinal',
        /*init: ({ servicesManager, extensionManager }) => {
          //defaultViewerRouteInit
        },*/
      layoutInstance: longitudinalInstance,
    };

const REPORTING_STATION_CLASSES = [
  'interpretation workstation',
  '110101',
  'reporting workstation',
  'diagnostic workstation',
  'diagnostic reporting',
  'mammography reporting',
  'nuclear medicine reporting',
  'pathology reporting',
  'cardiology reporting',
];

export const modeInstance = {
    ...basicModeInstance,
    // TODO: We're using this as a route segment
    // We should not be.
    id,
    routeName: 'viewer',
    displayName: i18n.t('Modes:Basic Viewer'),
    routes: [
      longitudinalRoute
    ],
    extensions: extensionDependencies,
    isValidMode: function ({ modalities, study }) {
      // Enable Basic Viewer for Reporting/Diagnostic station classes
      const stationClass = (study?.stationClass ?? '').toLowerCase().trim();
      if (stationClass && REPORTING_STATION_CLASSES.includes(stationClass)) {
        return { valid: true, description: 'Reporting/Diagnostic station class' };
      }

      // Fall back to the standard modality-based check from basic mode
      return basicModeInstance.isValidMode.call(this, { modalities, study });
    },
  };

const mode = {
  ...basicMode,
  id,
  modeInstance,
  extensionDependencies,
};

export default mode;
export { initToolGroups, toolbarButtons };
