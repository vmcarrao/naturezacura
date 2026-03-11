/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./*.{html,js}"],
    theme: {
        extend: {
            colors: {
                brand: {
                    green: '#1A3C34', // primary text and backgrounds
                    beige: '#F2F0E6', // soft background
                    white: '#FFFFFF', // standard white
                }
            },
            fontFamily: {
                serif: ['"Playfair Display"', 'serif'],
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
