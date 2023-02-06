import mapboxgl from 'mapbox-gl';
import {MAPBOX_API_TOKEN} from '$env/static/private';

// https://docs.mapbox.com/help/glossary/access-token/
mapboxgl.accessToken = MAPBOX_API_TOKEN

const key = Symbol();

export { mapboxgl, key };