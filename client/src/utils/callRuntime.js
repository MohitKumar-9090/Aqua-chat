let callsModule;

export const getCallRuntime = async () => {
  if (!callsModule) {
    callsModule = await import('./calls.js');
  }
  return callsModule;
};
