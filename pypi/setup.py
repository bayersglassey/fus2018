#!/usr/bin/env python

import setuptools, glob

fus_ext = setuptools.Extension('fus',
    sources=['src/main/py.c'] + glob.glob('src/*.c'))

with open("README.md", "r") as fh:
    long_description = fh.read()

setuptools.setup(
    name="Fus",
    version="0.0.11",
    author="Ben Ayers-Glassey",
    author_email="bayersglassey@gmail.com",
    description="Another little programming language",
    long_description=long_description,
    url="https://github.com/bayersglassey/fus2018",
    packages=setuptools.find_packages(),
    package_data={'fus': ['src/*.h']},
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
    ext_modules=[fus_ext],
)
