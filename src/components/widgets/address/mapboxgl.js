import mapboxgl from 'mapbox-gl';
import env from '@root/env';

// https://docs.mapbox.com/help/glossary/access-token/
mapboxgl.accessToken = env.MAPBOX_API_TOKEN

const key = Symbol();

export { mapboxgl, key };