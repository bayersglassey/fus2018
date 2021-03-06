#ifndef _FUS_INCLUDES_H_
#define _FUS_INCLUDES_H_

#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>

#ifdef FUS_ENABLE_BACKTRACE
    #include <execinfo.h>
    void fus_backtrace();
    #define FUS_BACKTRACE fus_backtrace();
#else
    #define FUS_BACKTRACE ;
#endif

#ifdef FUS_DEBUG_MALLOC
    #include <malloc.h>
#endif


#include "pathutil.h"

#include "array.h"
#include "lexer.h"
#include "write.h"

#include "symcodes.h"
#include "symtable.h"
#include "value.h"
#include "stack.h"


#include "code.h"


#include "compiler.h"
#include "state.h"


#include "util.h"



#endif