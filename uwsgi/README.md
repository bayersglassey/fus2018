# Uwsgi Plugin

This uses uwsgi's [symcall](https://uwsgi-docs.readthedocs.io/en/latest/Symcall.html) option.
It's really just a hacky test for now, but it works!

From the repo's root directory, try:

    uwsgi/compile

This should generate ``plugin.so``.
You can then run it with:

    uwsgi/run

The plugin expects to have fus code POSTed to it.
To see this in action, with uwsgi still running, open another terminal window and try:

    uwsgi/curl_test

