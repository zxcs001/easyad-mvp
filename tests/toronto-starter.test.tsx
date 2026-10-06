/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import TorontoStarter from '../app/component/toronto-starter';
const mock = vi.hoisted(() => ({ loaded: false, events: {} as Record<string, () => void>, easeTo: vi.fn(), setLayoutProperty: vi.fn(), options: {} as Record<string, unknown> }));
vi.mock('maplibre-gl', () => ({ default: {
  Map: class {
    constructor(options: Record<string, unknown>) { mock.options = options; }
    addControl() {} on(name: string, callback: () => void) { mock.events[name] = callback; }
    isStyleLoaded() { return mock.loaded; } getLayer() { return true; }
    getStyle() { return { layers: [{ id: 'poi-labels', 'source-layer': 'poi' }, { id: 'road-labels', 'source-layer': 'transportation_name' }] }; }
    setLayoutProperty = mock.setLayoutProperty;
    setPaintProperty() {} remove() {} easeTo = mock.easeTo;
  }, NavigationControl: class {}, AttributionControl: class {},
} }));
let success: PositionCallback;
let failure: PositionErrorCallback;
beforeEach(() => {
  mock.loaded = false; mock.easeTo.mockClear(); mock.setLayoutProperty.mockClear();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
    getCurrentPosition: vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => { success = ok; failure = fail; }),
  } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function locate() { act(() => success({ coords: { longitude: 151.2093, latitude: -33.8688 } } as GeolocationPosition)); }
function load() { act(() => { mock.loaded = true; mock.events.load(); }); }
test.each([true, false])('centers on geolocation whether it resolves before map load: %s', (beforeLoad) => {
  render(<TorontoStarter show><div>Portal</div></TorontoStarter>);
  if (beforeLoad) { locate(); load(); } else { load(); locate(); }
  expect(mock.setLayoutProperty).toHaveBeenCalledExactlyOnceWith('poi-labels', 'visibility', 'none');
  expect(mock.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [151.2093, -33.8688], zoom: 15.55 }));
  expect(screen.getByRole('status')).toHaveTextContent('33.8688 S / 151.2093 E');
});
test.each([1, 2, 3])('unavailable location falls back to downtown Toronto (error %s)', (code) => {
  render(<TorontoStarter show><div>Portal</div></TorontoStarter>);
  act(() => failure({ code } as GeolocationPositionError)); load();
  expect(mock.options.center).toEqual([-79.3832, 43.6532]);
  expect(mock.easeTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [-79.3832, 43.6532], zoom: 15.55 }));
  expect(screen.getByRole('status')).toHaveTextContent('Location unavailable — showing downtown Toronto');
});
test('unsupported geolocation still lets users enter the portal', () => {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
  render(<TorontoStarter show><div>Portal</div></TorontoStarter>);
  expect(screen.getByRole('status')).toHaveTextContent('Location unavailable');
  expect(screen.getByRole('button', { name: 'Start my campaign' })).toBeEnabled();
});
test('ignores location callbacks after unmount', () => {
  const result = render(<TorontoStarter show><div>Portal</div></TorontoStarter>);
  result.unmount(); locate();
  expect(mock.easeTo).not.toHaveBeenCalled();
});
