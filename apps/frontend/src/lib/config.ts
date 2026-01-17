/**
 * API Configuration for SveltyCMS Frontend
 */

// Base API URL for REST endpoints
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5173/api';

// GraphQL endpoint
export const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:5173/api/graphql';

// API authentication token (if required)
export const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

// Default language
export const DEFAULT_LANGUAGE = 'en';
