export interface EmulatorConfig {
  numClients: number;
  cyclesPerClient: number;
  haproxyHttpUrl: string;
  haproxyWsUrl: string;
  responseLengthWords: number;
  tokenDelaySeconds: number;
  connectionTimeout: number;
  requestTimeout: number;
  jwtSecret: string;
  centrifugoApiKey: string;
}

export function loadConfig(): EmulatorConfig {
  const args = process.argv.slice(2);
  const getArg = (name: string, defaultValue: string): string => {
    const index = args.indexOf(name);
    return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
  };

  return {
    numClients: parseInt(getArg('--clients', process.env.NUM_CLIENTS || '10')),
    cyclesPerClient: parseInt(getArg('--cycles', process.env.CYCLES_PER_CLIENT || '5')),
    haproxyHttpUrl: process.env.HAPROXY_HTTP_URL || 'http://localhost:9000',
    haproxyWsUrl: process.env.HAPROXY_WS_URL || 'ws://localhost:9001',
    responseLengthWords: parseInt(getArg('--length', process.env.RESPONSE_LENGTH_WORDS || '100')),
    tokenDelaySeconds: parseFloat(getArg('--delay', process.env.TOKEN_DELAY_SECONDS || '0.01')),
    connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT || '30') * 1000,
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '120') * 1000,
    jwtSecret: 'super-secret-jwt-key',
    centrifugoApiKey: 'super-secret-api-key'
  };
}
