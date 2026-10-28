import QRCode from 'qrcode'

// Printed copies should open the public tool even when generated on localhost.
export const PUBLIC_SITE_URL = 'https://kylenessen.github.io/nearby-lifers/'
export function qrGraphic(url: string) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const quiet = 4
  const path: string[] = []
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++)
      if (modules.get(y, x)) path.push(`M${x + quiet} ${y + quiet}h1v1h-1z`)
  return { size: modules.size + quiet * 2, path: path.join('') }
}
