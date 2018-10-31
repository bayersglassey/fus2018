# Uwsgi Plugin

Fus plugin for the [UWSGI](https://uwsgi-docs.readthedocs.io/en/latest/) application server.
Just a test for now, but it works!

From the repo's root directory, try:

    uwsgi/compile

This should generate ``fus_plugin.so``.
You can then run it with:

    uwsgi/run

The plugin expects to have fus code POSTed to it.
To see this in action, with uwsgi still running, open another terminal window and try:

    uwsgi/curl_test


## Source Code

It's in [src/newvalues/uwsgi](/src/newvalues/uwsgi).
