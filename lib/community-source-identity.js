function isDynamicSource(source = {}) {
  return ['civicplus-calendar', 'live-status'].includes(source.connectorType) || source.sourceType === 'events';
}
module.exports = { isDynamicSource };
