// Language recognition only. Callers still require approved, relevant source
// evidence; finding these words cannot establish permission by itself.
function hasPermissionStatement(text = "") {
  return /\b(?:yes|no|allowed|approved|preapproved|bars?|forbids?|disallows?|prohibited|required|requires|approval|permission|can|may|must|need to)\b/i.test(text)
    || /(?:^|[.!?]\s+|\n)turn off\b/i.test(String(text).trim());
}

module.exports = { hasPermissionStatement };
