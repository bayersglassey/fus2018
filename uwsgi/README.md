# Uwsgi Plugin

Fus plugin for the [UWSGI](https://uwsgi-docs.readthedocs.io/en/latest/) application server.
Just a test for now, but it works!

## Compiling & Running

From the repo's root directory, try:

    ./uwsgi/compile

This should generate ``fus_plugin.so``.
You can then run it with:

    # Basically just:
    #     uwsgi --plugin fus --http-socket :9090 --http-socket-modifier1 18 $@
    ./uwsgi/run

Without further options, though, the plugin won't respond to HTTP requests.

### "Execpost" mode

In this mode, the plugin expects to have fus code POSTed to it.
It runs the code in a fresh vm, then returns the VM's stack.

    ./uwsgi/run --fus_execpost

To see this in action, with uwsgi still running, open another terminal window and try:

    ./uwsgi/curl_test

### "App" mode

In this mode, you tell the plugin which file to run as a web app.
Work in progress!

    ./uwsgi/run --fus fus/webapp.fus

Then in a separate terminal window:

    ./uwsgi/curl_test "This is the POST body!"

## Source Code

See [src/newvalues/main/uwsgi.c](src/newvalues/main/uwsgi.c) and [src/newvalues/uwsgi](/src/newvalues/uwsgi).
