#ifndef _FUS_BACKTRACE_H_
#define _FUS_BACKTRACE_H_

#include <stdio.h>

#ifndef FUS_MAX_BACKTRACE_FRAMES
#define FUS_MAX_BACKTRACE_FRAMES 128
#endif

#ifdef FUS_ENABLE_BACKTRACE
    void fus_backtrace(FILE *file, int tab_depth);
    #define FUS_BACKTRACE \
        fprintf(stderr, "%s: Backtrace:\n", __func__); \
        fus_backtrace(stderr, 2);
#else
    #define FUS_BACKTRACE ;
#endif

#endif