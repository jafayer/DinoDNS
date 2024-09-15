import {ConsoleLogger, LogLevel} from ".";

describe('ConsoleLogger', () => {
    let logger: ConsoleLogger;

    beforeEach(() => {
        logger = new ConsoleLogger();

        // Mock console methods
        console.debug = jest.fn();
        console.info = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();
    });

    it('should log messages at the correct level', () => {
        logger.debug('debug');
        expect(console.debug).toHaveBeenCalledWith('[DEBUG] debug');

        logger.info('info');
        expect(console.info).toHaveBeenCalledWith('[INFO] info');

        logger.warn('warn');
        expect(console.warn).toHaveBeenCalledWith('[WARN] warn');

        logger.error('error');
        expect(console.error).toHaveBeenCalledWith('[ERROR] error');
    });

    it('should log messages at the correct level when using log method', () => {
        logger.log(LogLevel.DEBUG, 'debug');
        expect(console.debug).toHaveBeenCalledWith('[DEBUG] debug');

        logger.log(LogLevel.INFO, 'info');
        expect(console.info).toHaveBeenCalledWith('[INFO] info');

        logger.log(LogLevel.WARN, 'warn');
        expect(console.warn).toHaveBeenCalledWith('[WARN] warn');

        logger.log(LogLevel.ERROR, 'error');
        expect(console.error).toHaveBeenCalledWith('[ERROR] error');
    });
});