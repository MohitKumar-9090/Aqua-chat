const MEDIA_ERROR_MESSAGES = {
  NotAllowedError: 'Microphone or camera access was denied. Allow permissions in your browser settings and try again.',
  PermissionDeniedError: 'Microphone or camera access was denied. Allow permissions in your browser settings and try again.',
  NotFoundError: 'No microphone or camera was found on this device.',
  NotReadableError: 'Your microphone or camera is in use by another app.',
  OverconstrainedError: 'This device cannot satisfy the requested call settings.',
  SecurityError: 'Media access requires a secure connection (HTTPS).'
};

export const getCallMediaStream = async (callType, { retryOnce = true } = {}) => {
  const constraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: callType === 'video' ? {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 }
    } : false
  };

  const request = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support calls. Try Chrome or Safari on HTTPS.');
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  };

  try {
    return await request();
  } catch (error) {
    if (retryOnce && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return request();
    }
    const friendly = MEDIA_ERROR_MESSAGES[error.name];
    throw new Error(friendly || error.message || 'Could not access microphone or camera.');
  }
};
