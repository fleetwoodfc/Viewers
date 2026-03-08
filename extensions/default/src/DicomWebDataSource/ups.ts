/**
 * UPS (Unified Procedure Step) data-source helper.
 * Parallel to qido.js — provides a search function for DICOMWeb UPS workitems.
 *
 * Endpoint: GET {wadoRoot}/workitems
 * Reference: DICOM PS3.18 §10.9
 */

/**
 * Search for UPS workitems via DICOMWeb RS.
 *
 * Attempts to use `dicomWebClient.searchForWorkitems()` if available on the
 * client; otherwise falls back to a raw `fetch` against
 * `${dicomWebClient.wadoRoot}/workitems` with the provided query parameters.
 *
 * @param dicomWebClient - A DICOMweb client instance (e.g. dicomweb-client)
 * @param queryParameters - DICOM attribute tag key→value pairs to filter by
 * @returns Array of DICOM JSON workitem objects, or [] on a 204 (No Content) response
 */
export async function searchWorkitems(
  dicomWebClient: any,
  queryParameters: Record<string, string>
): Promise<any[]> {
  // Prefer the native client method if available
  if (typeof dicomWebClient.searchForWorkitems === 'function') {
    const results = await dicomWebClient.searchForWorkitems({
      queryParams: queryParameters,
    });
    return results || [];
  }

  // Fallback: raw fetch to {wadoRoot}/workitems
  const baseUrl = dicomWebClient.wadoRoot;
  if (!baseUrl) {
    console.warn('UPS search: dicomWebClient has no wadoRoot, cannot fetch workitems');
    return [];
  }

  const url = new URL(`${baseUrl}/workitems`);
  Object.entries(queryParameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const headers: Record<string, string> = {
    Accept: 'application/dicom+json',
  };

  // Propagate auth headers if available on the client
  if (dicomWebClient.headers) {
    Object.assign(headers, dicomWebClient.headers);
  }

  const response = await fetch(url.toString(), { headers });

  if (response.status === 204) {
    return [];
  }

  if (!response.ok) {
    throw new Error(
      `UPS workitems request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}
