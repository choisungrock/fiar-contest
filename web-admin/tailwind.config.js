/** K-라이스페스타 관리자 콘솔 테마 및 TailwindCSS 디자인 토큰 설정 파일 */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          dark: '#1b2a4a',
          DEFAULT: '#1b2a4a',
        },
        secondary: {
          dark: '#243a63',
          DEFAULT: '#243a63',
        },
        sidebar: {
          bg: '#20325a',
          line: '#2f4269',
        },
        accent: {
          red: '#e03b3b',
          'red-hover': '#c0392b',
          gold: '#d9b866',
          'gold-dark': '#8a6a1e',
        },
        matrix: {
          blue: '#2f5488',
          'blue-bg': '#eef4fb',
          green: '#2f5a3a',
          'green-bg': '#f1f7f1',
          red: '#c0392b',
          'red-bg': '#fbebeb',
        }
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
