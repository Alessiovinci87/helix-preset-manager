/** "HD2_Cab4x12Greenback25" → "4x12 Greenback25"; varianti MicIr/WithPan distinte nel suffisso */
export function prettyCab(model: string): string {
  const dualMic = /^HD2_CabMicIr_/.test(model)
  const withPan = /WithPan$/.test(model)
  const name = model
    .replace(/^HD2_Cab(MicIr_)?/, '')
    .replace(/WithPan$/, '')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
  return dualMic ? `${name} (dual mic${withPan ? ' + pan' : ''})` : name
}
