# Headers sent with every response. nginx drops server-level add_header
# directives in any location that declares its own, so each location
# includes this file instead of relying on inheritance.
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
