const { sleep, ensureDir } = require('../lib/utils');
const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('Utils', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('sleep should resolve after specified time', async () => {
        const start = Date.now();
        await sleep(100);
        const end = Date.now();
        expect(end - start).toBeGreaterThanOrEqual(95); // Allow small margin
    });

    test('ensureDir should create directory if not exists', () => {
        fs.existsSync.mockReturnValue(false);
        ensureDir('/test/dir');
        expect(fs.mkdirSync).toHaveBeenCalledWith('/test/dir', { recursive: true });
    });

    test('ensureDir should not create directory if exists', () => {
        fs.existsSync.mockReturnValue(true);
        ensureDir('/test/dir');
        expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
});
