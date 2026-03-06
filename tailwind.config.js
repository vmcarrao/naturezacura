/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./*.{html,js}"],
    theme: {
        extend: {
            colors: {
                green: {
                    50: '#f0fdf4', // very pale pastel green
                    900: '#14532d', // deep forest green
                },
                rose: {
                    50: '#fff1f2', // soft misty rose
                    400: '#fb7185', // muted clay/terracotta (approx)
                },
                stone: {
                    50: '#fafaf9', // soft cream/off-white
                }
            },
            fontFamily: {
                serif: ['"Playfair Display"', 'serif'],
                sans: ['Lato', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
