
#include "includes.h"

#ifdef FUS_ENABLE_BACKTRACE

#define FUS_MAX_BACKTRACE_FRAMES 128

void fus_backtrace(){
    void* callstack[FUS_MAX_BACKTRACE_FRAMES];
    int frames = backtrace(callstack, FUS_MAX_BACKTRACE_FRAMES);
    char** strs = backtrace_symbols(callstack, frames);
    for(int i = 0; i < frames; i++){
        printf("%s\n", strs[i]);
    }
    free(strs);
}

#endif