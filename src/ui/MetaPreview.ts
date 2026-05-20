import type { MetadataField, MetadataGroup, ReadMetadataResult } from '@/types';
import { t } from '@/i18n';
import { el } from './utils';

const GROUP_ORDER: MetadataGroup[] = [
  'gps',
  'datetime',
  'device',
  'author',
  'serial',
  'thumbnail',
  'software',
  'description',
  'other',
];

export function renderMetaPreview(meta: ReadMetadataResult): HTMLElement {
  if (meta.totalCount === 0) {
    return el('div', { className: 'text-sm text-ink-400', text: t('card.found.none') });
  }

  const root = el('div', { className: 'space-y-3' });

  // Группированный «человеческий» вид (свёрнутый по умолчанию для not-priority)
  const grouped = groupFields(meta.fields);
  for (const g of GROUP_ORDER) {
    const list = grouped.get(g);
    if (!list || list.length === 0) continue;
    root.append(renderGroup(g, list, meta));
  }

  // «Показать все NN»
  const all = el('details', { className: 'mt-3' });
  const summary = el('summary', {
    className: 'cursor-pointer text-xs text-ink-400 hover:text-ink-200',
    text: t('card.show_all', { n: meta.totalCount }),
  });
  all.append(summary);
  const allBox = el('div', { className: 'mt-2 max-h-64 overflow-auto rounded-lg bg-black/20 p-3 light:bg-ink-50 light:bg-opacity-100' });
  for (const f of meta.fields) {
    const row = el('div', { className: 'field-row' });
    row.append(el('span', { className: 'field-label', text: f.label }));
    row.append(el('span', { className: 'field-value', text: f.value }));
    allBox.append(row);
  }
  all.append(allBox);
  root.append(all);

  return root;
}

function groupFields(fields: MetadataField[]): Map<MetadataGroup, MetadataField[]> {
  const m = new Map<MetadataGroup, MetadataField[]>();
  for (const f of fields) {
    const arr = m.get(f.group) ?? [];
    arr.push(f);
    m.set(f.group, arr);
  }
  return m;
}

function renderGroup(
  group: MetadataGroup,
  list: MetadataField[],
  meta: ReadMetadataResult,
): HTMLElement {
  const wrap = el('div');
  const title = el('div', { className: 'group-title', text: t(`meta.group.${group}`) });
  wrap.append(title);

  if (group === 'gps') {
    if (meta.gps) {
      const lat = meta.gps.latitude.toFixed(6);
      const lon = meta.gps.longitude.toFixed(6);
      const line = el('div', { className: 'field-row' });
      line.append(el('span', { className: 'field-label', text: 'GPS' }));
      line.append(
        el('span', { className: 'field-value', text: t('meta.gps.coords', { lat, lon }) }),
      );
      wrap.append(line);
      if (typeof meta.gps.altitude === 'number') {
        const alt = el('div', { className: 'field-row' });
        alt.append(el('span', { className: 'field-label', text: 'Alt' }));
        alt.append(
          el('span', {
            className: 'field-value',
            text: t('meta.gps.altitude', { alt: meta.gps.altitude.toFixed(1) }),
          }),
        );
        wrap.append(alt);
      }

      // Lazy-загрузка Leaflet для мини-карты
      const mapBox = el('div', {
        className: 'mt-2 h-40 w-full overflow-hidden rounded-lg border border-white/5 bg-black/30',
        attrs: { 'aria-label': 'GPS map' },
      });
      wrap.append(mapBox);
      mountLeaflet(mapBox, meta.gps.latitude, meta.gps.longitude).catch(() => {
        mapBox.remove();
      });

      const openMap = el('a', {
        className: 'mt-2 inline-flex text-xs text-cyan hover:underline',
        text: t('meta.gps.open_map'),
        attrs: {
          href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      });
      wrap.append(openMap);
      return wrap;
    }
  }

  for (const f of list) {
    const row = el('div', { className: 'field-row' });
    row.append(el('span', { className: 'field-label', text: f.label }));
    row.append(el('span', { className: 'field-value', text: f.value }));
    wrap.append(row);
  }
  return wrap;
}

async function mountLeaflet(host: HTMLElement, lat: number, lon: number): Promise<void> {
  await import('leaflet/dist/leaflet.css');
  const L = await import('leaflet');
  const map = L.map(host, { zoomControl: false, attributionControl: false }).setView(
    [lat, lon],
    14,
  );
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
  }).addTo(map);
  L.marker([lat, lon]).addTo(map);
  L.control
    .attribution({ position: 'bottomright', prefix: false })
    .addAttribution('© <a href="https://openstreetmap.org/copyright">OSM</a>')
    .addTo(map);
}
