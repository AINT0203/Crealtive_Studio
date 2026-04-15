export const AUTH_SESSION_KEY = 'creaitive_authenticated'

/** Demo credentials — checked on the client only */
export const DEMO_EMAIL = 'omkar@affine.ai'
export const DEMO_PASSWORD = 'omkar@123'

export function isSessionAuthenticated(): boolean {
  try {
    return sessionStorage.getItem(AUTH_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function setSessionAuthenticated(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(AUTH_SESSION_KEY, '1')
    else sessionStorage.removeItem(AUTH_SESSION_KEY)
  } catch {
    /* private mode */
  }
}
