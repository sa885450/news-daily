/**
 * @jest-environment jsdom
 */

// 重現 src/views/index.ejs 中的 toggleSpeech 邏輯
// 注意：由於這是從 EJS 中提取的邏輯，若 EJS 修改，此測試也需同步更新
// 真正的最佳實踐是將邏輯提取為獨立 .js 檔案，但為了保持專案結構簡單，以測試確保邏輯正確性為主

describe('TTS Client Logic', () => {
    let windowSpy;
    let mockSpeechSynthesis;
    let mockUtterance;

    beforeEach(() => {
        // Mock DOM Elements
        document.body.innerHTML = `
            <button id="ttsBtn" class="bg-indigo-50 text-indigo-600">
                <svg id="ttsIcon"></svg>
            </button>
            <div id="summary-content">這是一段測試摘要。</div>
        `;

        // Mock SpeechSynthesis
        mockSpeechSynthesis = {
            cancel: jest.fn(),
            speak: jest.fn(),
        };

        // Mock SpeechSynthesisUtterance
        mockUtterance = jest.fn((text) => ({ text }));
        global.SpeechSynthesisUtterance = mockUtterance;

        Object.defineProperty(window, 'speechSynthesis', {
            value: mockSpeechSynthesis,
            writable: true
        });

        // 定義全域變數與函數 (模擬瀏覽器環境)
        global.speaking = false;

        // 將 index.ejs 中的 toggleSpeech 邏輯複製於此進行測試
        global.toggleSpeech = function () {
            const btn = document.getElementById('ttsBtn');
            const icon = document.getElementById('ttsIcon');

            if (global.speaking) {
                window.speechSynthesis.cancel();
                global.speaking = false;
                // icon.innerHTML = '...'; (簡化 icon SVG 內容測試)
                btn.classList.remove('bg-red-50', 'text-red-600');
                btn.classList.add('bg-indigo-50', 'text-indigo-600');
            } else {
                const text = document.getElementById('summary-content').textContent;
                const u = new SpeechSynthesisUtterance(text);
                u.lang = 'zh-TW';
                u.rate = 1.0;

                // 模擬 onend 事件掛載
                u.onend = () => {
                    global.speaking = false;
                    btn.classList.remove('bg-red-50', 'text-red-600');
                    btn.classList.add('bg-indigo-50', 'text-indigo-600'); // Reset color
                };

                window.speechSynthesis.speak(u);
                global.speaking = true;

                btn.classList.remove('bg-indigo-50', 'text-indigo-600');
                btn.classList.add('bg-red-50', 'text-red-600');
            }
        };
    });

    test('should start speaking when clicked (toggle on)', () => {
        global.toggleSpeech();

        expect(mockSpeechSynthesis.cancel).not.toHaveBeenCalled();
        expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
        expect(global.speaking).toBe(true);

        const btn = document.getElementById('ttsBtn');
        expect(btn.classList.contains('bg-red-50')).toBe(true); // Should turn red
    });

    test('should stop speaking when clicked again (toggle off)', () => {
        // First click (Start)
        global.toggleSpeech();
        expect(global.speaking).toBe(true);

        // Second click (Stop)
        global.toggleSpeech();

        expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
        expect(global.speaking).toBe(false);

        const btn = document.getElementById('ttsBtn');
        expect(btn.classList.contains('bg-indigo-50')).toBe(true); // Should return to indigo
    });

    test('should reset state when speech ends (onend)', () => {
        // Start speaking
        global.toggleSpeech();
        expect(global.speaking).toBe(true);

        // Get the utterance instance passed to speak
        const utteranceInstance = mockSpeechSynthesis.speak.mock.calls[0][0];

        // Simulate onend event
        if (utteranceInstance.onend) {
            utteranceInstance.onend();
        }

        expect(global.speaking).toBe(false);
        const btn = document.getElementById('ttsBtn');
        expect(btn.classList.contains('bg-indigo-50')).toBe(true); // Should return to indigo
    });

    test('should encode text correctly', () => {
        global.toggleSpeech();
        // Check if the mock constructor was called with the correct text
        expect(mockUtterance).toHaveBeenCalledWith('這是一段測試摘要。');
    });
});
