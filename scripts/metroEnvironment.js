function normalizeAppEnvironment(value) {
  return value?.trim().toLowerCase() || 'local';
}

module.exports = {normalizeAppEnvironment};
