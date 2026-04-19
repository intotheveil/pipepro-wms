/**
 * Infer a category code from a material description.
 * 30 codes, evaluated in strict priority order (first match wins).
 */

export function inferCategoryCode(description) {
  if (!description) return 'OTH';
  const d = description.toUpperCase().trim();

  const sw = (p) => d.startsWith(p);
  const inc = (p) => d.includes(p);

  if (sw('PIPE'))                                                                      return 'PIP';
  if (inc('ELBOW 45') || inc('ELB. 45') || inc('ELB 45'))                              return 'EL45';
  if (inc('ELBOW 90') || inc('ELB. 90') || inc('ELB 90')) {
    if (inc(' SR ') || d.endsWith(' SR') || inc(', SR,'))                              return 'EL90S';
    return 'EL90';
  }
  if (sw('TEE REDUC') || sw('TEE, RED') || sw('TEE R'))                                return 'RTEE';
  if (sw('TEE'))                                                                       return 'TEE';
  if (inc('REDUCER ECC') || inc('REDUCER, ECC'))                                       return 'REDE';
  if (sw('REDUCER') || sw('RED,'))                                                     return 'RED';
  if (sw('SWAGE') || sw('SWG'))                                                        return 'SWG';
  if (sw('CAP'))                                                                       return 'CAP';
  if (sw('COUPLING') || sw('CPL'))                                                     return 'CPL';
  if (sw('NIPPLE'))                                                                    return 'NIP';
  if (sw('BUSHING'))                                                                   return 'BSH';
  if (sw('STUB END') || sw('STUB, END'))                                               return 'STB';
  if (inc('SOCKOLET') || inc('WELDOLET') || inc('THREDOLET'))                          return 'SOC';
  if (sw('FLANGE BLIND') || inc('FLANGE, BLIND'))                                      return 'FLB';
  if (inc('FLANGE THDF') || inc('FLANGE, THDF') || inc('FLANGE, THREADED'))            return 'FLT';
  if (inc('FLANGE ORIFICE') || inc('ORIFICE FLANGE'))                                  return 'FLO';
  if (sw('FLANGE') || sw('FLG'))                                                       return 'FLW';
  if (sw('GASKET'))                                                                    return 'GSK';
  if (inc('STUD BOLT') || inc('STUD, BOLT') || inc('STUDBOLT'))                        return 'BLT';
  if (inc('VALVE BALL') || inc('VALVE, BALL'))                                         return 'VLB';
  if (inc('VALVE GLOBE') || inc('VALVE, GLOBE'))                                       return 'VLG';
  if (inc('VALVE CHECK') || inc('VALVE, CHECK'))                                       return 'VLC';
  if (inc('VALVE BUTTERFLY') || inc('VALVE, BUTTERFLY'))                                return 'VLBF';
  if (inc('VALVE GATE') || inc('VALVE, GATE'))                                         return 'VLGT';
  if (sw('VALVE'))                                                                     return 'VLO';
  if (inc('ISOLATION KIT') || inc('DIELECTRIC'))                                       return 'ISK';
  if (inc('INSTRUMENT') || inc('GAUGE') || inc('THERMOMETER') || inc('TRANSMITTER'))   return 'INS';

  return 'OTH';
}

/** The 30 valid codes for validation */
export const VALID_CATEGORY_CODES = new Set([
  'PIP', 'EL45', 'EL90', 'EL90S', 'RTEE', 'TEE', 'REDE', 'RED', 'SWG', 'CAP',
  'CPL', 'NIP', 'BSH', 'STB', 'SOC', 'FLB', 'FLT', 'FLO', 'FLW', 'GSK',
  'BLT', 'VLB', 'VLG', 'VLC', 'VLBF', 'VLGT', 'VLO', 'ISK', 'INS', 'OTH',
]);
