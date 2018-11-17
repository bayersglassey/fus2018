
# Fus in Javascript (via Emscripten)

A grand experiment which succeeded quicker than I expected.
I guess I can put "Emscripten expert" on my resume now.


## Compiling

I used the [Emscripten SDK](https://kripken.github.io/emscripten-site/docs/getting_started/downloads.html).
Once you've successfully done this line of that tutorial:

    source ./emsdk_env.sh

...you should have ``emcc`` available on your command line.
So try the "js" compile target for fus:

    # Should generate js/fus.js, js/fus.html
    ./compile js


## Running

If all goes well with compilation, try:

    cd js
    python3 -m http.server 8000
    # Apparently there's an "emrun" command you can use instead of Python?..

Now in your browser, visit: ``localhost:8000/fus.html``.
In the JS console, try:

    function fus_exec(text){
        /* Execute arbitrary fus code, passed as a JS string */
        var f = Module.cwrap('exec');
        var ptr = allocate(intArrayFromString(text), 'i8', ALLOC_NORMAL);
        assert(f(ptr) === 0, "Fus error!");
        _free(ptr);
    }

    fus_exec("fun of(x->y)(2 +) ='add2 \"TEN PLUS TWO: \" str_p 10 'add2 call(x->y) p");

    // Expected result: "TEN PLUS TWO: 12" logged to the console

Glorious.


## Running Test Suite in Browser

The same test suite which can be run as:

    ./compile test && ./main

...can be run in the browser:

    ./compile js test
    cd js
    python3 -m http.server 8000

