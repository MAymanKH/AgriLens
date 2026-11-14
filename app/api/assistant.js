import { createAssistant, assistantHttp } from '../assistant.js';
const assistant = createAssistant({ comparisonUrl: process.env.COMPARISON_BASE_URL || 'https://agriapi.mohamedayman.net' });
export default (request, response) => assistantHttp(request, response, assistant);
