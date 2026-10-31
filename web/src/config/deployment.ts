/** Build-time adapter selection. Local FastAPI behavior remains the default. */
export const isCloudDeployment = import.meta.env.VITE_DEPLOYMENT_TARGET === 'netlify'
