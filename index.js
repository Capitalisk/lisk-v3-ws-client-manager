const {createWSClient} = require('@liskhq/lisk-api-client');
const {wait} = require('./utils');

class LiskNodeWsClient {

    static RETRY_INTERVAL = 10 * 1000; // ms
    static MAX_RETRY = 10;
    static defaultNodeURL = 'ws://localhost:8080/ws';

    constructor({config, logger}) {
        this.setDefaultConfig(config);
        this.liskNodeWsURL = config.rpcURL;
        this.logger = logger;
        this.isInstantiating = false;
        this.wsClient = null;
        this.onConnected = async () => {
        };
        this.onDisconnected = async () => {
        };
        this.onClosed = async () => {
        };
    }

    setDefaultConfig = (config) => {
        if (!config.rpcURL) {
            config.rpcURL = LiskNodeWsClient.defaultNodeURL;
        }
    };

    // eslint-disable-next-line consistent-return
    instantiateClient = async (nodeWsHost) => {
        try {
            if (!this.isInstantiating) {
                if (!this.wsClient || !this.wsClient._channel.isAlive) {
                    this.isInstantiating = true;
                    if (this.wsClient) await this.wsClient.disconnect();
                    this.wsClient = await createWSClient(`${nodeWsHost}`);
                    if (this.wsClient._channel && this.wsClient._channel.invoke) {
                        this.logger.info(`Connected WS node client to Host : ${nodeWsHost}`);
                        this.activeHost = nodeWsHost;
                        this.patchDisconnectEvent();
                        this.onConnected(this.wsClient);
                    }
                    this.isInstantiating = false;
                }
                if (this.wsClient._channel && this.wsClient._channel.invoke) {
                    return this.wsClient;
                }
            }
        } catch (err) {
            this.logger.error(`Error instantiating WS client to ${nodeWsHost}`);
            this.isInstantiating = false;
            this.logger.error(err.message);
            throw err;
        }
        return null;
    };

    patchDisconnectEvent = () => {
        this.internalOnClose = this.wsClient._channel._ws.onclose;
        this.wsClient._channel._ws.onclose = this.onDisconnect;
    };

    onDisconnect = () => {
        this.logger.warn(`Disconnected from server host ${this.activeHost}`);
        this.internalOnClose();
        this.onDisconnected();
        if (this.canReconnect) {
            this.createWsClient();
        }
    };

    createWsClient = async (throwOnConnectErr = false) => {
        let wsClientErr = null;
        this.canReconnect = true;
        for (let retry = 0 ; retry < LiskNodeWsClient.MAX_RETRY && this.canReconnect ; retry++) {
            try {
                this.logger.info(`Trying node WS primary host ${this.liskNodeWsURL}`);
                const nodeWsClient = await this.instantiateClient(this.liskNodeWsURL);
                if (nodeWsClient) {
                    return nodeWsClient;
                }
            } catch (err) {
                this.logger.warn(`Host(${this.liskNodeWsURL}) Error : ${err.message}`);
                wsClientErr = err;
            }
            this.logger.warn(`Retry: ${retry + 1}, Max retries : ${LiskNodeWsClient.MAX_RETRY}`);
            await wait(LiskNodeWsClient.RETRY_INTERVAL);
        }
        if (throwOnConnectErr) {
            throw wsClientErr;
        }
        await this.close(wsClientErr);
    };

    close = async (err) => {
        this.canReconnect = false;
        if (this.wsClient) {
            await this.wsClient.disconnect();
        }
        await this.onClosed(err);
    };
}

module.exports = LiskNodeWsClient;
