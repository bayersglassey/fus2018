#ifndef _FUS_INCLUDES_H_
#define _FUS_INCLUDES_H_

#include <stdlib.h>
#include <stdio.h>
#include <stdbool.h>
#include <string.h>
#include <limits.h>

#include "core.h"
#include "class.h"
#include "array.h"
#include "lexer.h"
#include "symtable.h"

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
#include "value.h"
#include "vm.h"
#include "arr.h"
#include "str.h"
#include "boxed.h"
#include "int_ops.h"
#include "printer.h"
#include "parser.h"

#endif