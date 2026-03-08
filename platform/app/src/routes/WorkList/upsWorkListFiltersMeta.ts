/**
 * Filter metadata for the UPS Worklist filter bar.
 * Structured identically to filtersMeta.js used by the regular WorkList.
 */
const upsWorkListFiltersMeta = [
  {
    name: 'patientName',
    displayName: 'Patient Name',
    inputType: 'Text',
    isSortable: true,
    gridCol: 4,
  },
  {
    name: 'patientId',
    displayName: 'Patient ID',
    inputType: 'Text',
    isSortable: true,
    gridCol: 3,
  },
  {
    name: 'procedureStepLabel',
    displayName: 'Step Label',
    inputType: 'Text',
    isSortable: true,
    gridCol: 5,
  },
  {
    name: 'procedureStepState',
    displayName: 'State',
    inputType: 'Select',
    inputProps: {
      options: [
        { value: '', label: 'All States' },
        { value: 'SCHEDULED', label: 'SCHEDULED' },
        { value: 'IN PROGRESS', label: 'IN PROGRESS' },
        { value: 'COMPLETED', label: 'COMPLETED' },
        { value: 'CANCELED', label: 'CANCELED' },
      ],
    },
    isSortable: false,
    gridCol: 4,
  },
];

export default upsWorkListFiltersMeta;
