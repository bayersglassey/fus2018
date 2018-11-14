
#include <stdio.h>
#include <stdlib.h>
#include <execinfo.h>

#include "backtrace.h"


#ifdef FUS_ENABLE_BACKTRACE
void fus_backtrace(FILE *file, int tab_depth){
    void* callstack[FUS_MAX_BACKTRACE_FRAMES];
    int frames = backtrace(callstack, FUS_MAX_BACKTRACE_FRAMES);
    char** strs = backtrace_symbols(callstack, frames);
    for(int i = 0; i < frames; i++){
        for(int j = 0; j < tab_depth; j++)fprintf(file, " ");
        fprintf(file, "%s\n", strs[i]);
    }
    free(strs);
}
#endif
