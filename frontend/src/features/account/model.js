/* Mirrors the server's AUTH_PASSWORD_VALIDATORS minimum (settings.py). */
export const PASSWORD_MIN = 12;

export const emptyPasswordForm = () => ({ current_password: "", new_password: "", confirm_password: "" });

export function validatePasswordForm(form) {
  const errors = {};
  if (!form.current_password) {
    errors.current_password = "Enter your current password.";
  }
  if (form.new_password.length < PASSWORD_MIN) {
    errors.new_password = `Use at least ${PASSWORD_MIN} characters.`;
  } else if (form.new_password === form.current_password) {
    errors.new_password = "Choose a password different from your current one.";
  }
  if (form.confirm_password !== form.new_password) {
    errors.confirm_password = "The passwords don't match.";
  }
  return errors;
}
