import mapboxgl from 'mapbox-gl';
import { MAPBOX_API_TOKEN } from '$env/static/private';

import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';

// https://docs.mapbox.com/help/glossary/access-token/
// mapboxgl.accessToken = MAPBOX_API_TOKEN;

const key = Symbol();

const geocoder = new MapboxGeocoder({
	accessToken: mapboxgl.accessToken,
	mapboxgl: mapboxgl
});

export { geocoder, mapboxgl, key };
