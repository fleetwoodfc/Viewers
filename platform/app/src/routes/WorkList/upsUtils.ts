/**
 * Utility functions for working with UPS (Unified Procedure Step) DICOM JSON workitems.
 */

/**
 * Safely extracts the Value[0] from a DICOM JSON attribute object.
 * @param dicomJson - A DICOM JSON object (keyed by DICOM tag strings like "00100010")
 * @param tag - The 8-character hex DICOM tag string (e.g. "00100010")
 * @returns The first value, or undefined if absent
 */
export function extractTagValue(dicomJson: Record<string, any>, tag: string): any {
  const attr = dicomJson?.[tag];
  if (!attr || !Array.isArray(attr.Value) || attr.Value.length === 0) {
    return undefined;
  }
  return attr.Value[0];
}

/**
 * Extracts a string value from a DICOM JSON attribute.
 * @param dicomJson - A DICOM JSON object
 * @param tag - The 8-character hex DICOM tag string
 * @returns The string value, or empty string if absent
 */
export function extractStringValue(dicomJson: Record<string, any>, tag: string): string {
  const val = extractTagValue(dicomJson, tag);
  if (val === undefined || val === null) {
    return '';
  }
  return String(val);
}

/**
 * Extracts and formats a DICOM person name from the Alphabetic component.
 * DICOM person names use "^" as a component delimiter (Family^Given^Middle^Prefix^Suffix).
 * This function replaces "^" separators with ", " for display.
 * @param dicomJson - A DICOM JSON object
 * @param tag - The 8-character hex DICOM tag string (e.g. "00100010")
 * @returns A formatted person name string, or empty string if absent
 */
export function extractPersonName(dicomJson: Record<string, any>, tag: string): string {
  const val = extractTagValue(dicomJson, tag);
  if (!val) {
    return '';
  }
  // DICOM person name may be an object with "Alphabetic", "Ideographic", "Phonetic" keys
  const alphabetic = typeof val === 'object' ? val.Alphabetic : String(val);
  if (!alphabetic) {
    return '';
  }
  // Replace "^" component separators with ", " for legibility
  return alphabetic.replace(/\^+/g, ', ').replace(/, $/, '').trim();
}

/**
 * Extracts a DT (DateTime) string value from a DICOM JSON attribute.
 * @param dicomJson - A DICOM JSON object
 * @param dateTimeTag - The 8-character hex DICOM tag string for a DT attribute
 * @returns The raw DT string (e.g. "20240115103045.000000"), or empty string
 */
export function extractDateTime(dicomJson: Record<string, any>, dateTimeTag: string): string {
  return extractStringValue(dicomJson, dateTimeTag);
}

/**
 * Maps a raw DICOM JSON UPS workitem object to a normalised display row.
 *
 * Key DICOM tags used:
 *  - (0008,0018) SOP Instance UID            → workitemUid
 *  - (0010,0010) Patient Name                → patientName
 *  - (0010,0020) Patient ID                  → patientId
 *  - (0074,1204) Scheduled Procedure Step Label → procedureStepLabel
 *  - (0074,1000) Procedure Step State        → procedureStepState
 *  - (0040,4005) Scheduled Procedure Step Start DateTime → scheduledDateTime
 *  - (0008,0050) Accession Number            → accessionNumber
 *  - (0040,4041) Input Readiness State       → inputReadinessState
 *  - (0008,1110)[0].(0020,000D) Referenced Study Instance UID → referencedStudyUid
 *
 * @param workitem - A raw DICOM JSON workitem object
 * @returns A normalised row object suitable for display
 */
export function mapWorkitemToRow(workitem: Record<string, any>): {
  workitemUid: string;
  patientName: string;
  patientId: string;
  procedureStepLabel: string;
  procedureStepState: string;
  scheduledDateTime: string;
  accessionNumber: string;
  inputReadinessState: string;
  referencedStudyUid: string;
} {
  // Referenced Study Sequence (0008,1110) → first item → Study Instance UID (0020,000D)
  const refStudySeq = workitem?.['00081110'];
  const refStudyItem =
    Array.isArray(refStudySeq?.Value) && refStudySeq.Value.length > 0
      ? refStudySeq.Value[0]
      : null;
  const referencedStudyUid = refStudyItem ? extractStringValue(refStudyItem, '0020000D') : '';

  return {
    workitemUid: extractStringValue(workitem, '00080018'),
    patientName: extractPersonName(workitem, '00100010'),
    patientId: extractStringValue(workitem, '00100020'),
    procedureStepLabel: extractStringValue(workitem, '00741204'),
    procedureStepState: extractStringValue(workitem, '00741000'),
    scheduledDateTime: extractDateTime(workitem, '00404005'),
    accessionNumber: extractStringValue(workitem, '00080050'),
    inputReadinessState: extractStringValue(workitem, '00404041'),
    referencedStudyUid,
  };
}
