#ifndef _FUS_INCLUDES_H_
#define _FUS_INCLUDES_H_

#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>
#include <string.h>
#include <limits.h>

#ifndef FUS_USE_SETJMP
#define FUS_USE_SETJMP 1
#endif
#if FUS_USE_SETJMP
#include <setjmp.h>
#endif

#include "backtrace.h"
#include "core.h"
#include "class.h"
#include "array.h"
#include "lexer.h"
#include "symtable.h"
#include "util.h"

/* Files which expect to be included by "includes.h", and their
primary typedefs */
typedef union fus_value fus_value_t;
typedef struct fus_vm fus_vm_t;
typedef struct fus_boxed fus_boxed_t;
typedef struct fus_arr fus_arr_t;
typedef struct fus_obj fus_obj_t;
typedef struct fus_str fus_str_t;
typedef struct fus_fun fus_fun_t;
typedef struct fus_printer fus_printer_t;
typedef struct fus_runner fus_runner_t;
typedef struct fus_runner_callframe fus_runner_callframe_t;
typedef struct fus fus_t;
#include "value.h"
#include "vm.h"
#include "arr.h"
#include "str.h"
#include "obj.h"
#include "fun.h"
#include "boxed.h"
#include "int_ops.h"
#include "printer.h"
#include "parser.h"
#include "runner.h"
#include "fus.h"

#endif