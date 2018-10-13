#ifndef _FUS_VALUE_H_
#define _FUS_VALUE_H_

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


#define FUS_TAG_BOXED      0
#define FUS_TAG_INT        1
#define FUS_TAG_SYM        2
#define FUS_TAG_OTHER      3

#define FUS_TAG_SHIFT      2
#define FUS_TAG_MASK       ((1 << FUS_TAG_SHIFT) - 1)

#define FUS_GET_TAG(X)          ((X) & FUS_TAG_MASK)
#define FUS_GET_PAYLOAD(X)      ((X) >> FUS_TAG_SHIFT)
#define FUS_ADD_TAG(TAG, PLOAD) ( ((PLOAD) << FUS_TAG_SHIFT) | (TAG))


/* WARNING: The following may be wrong... gotta test */
#define FUS_PAYLOAD_MIN (FUS_UNBOXED_MIN >> FUS_TAG_SHIFT)
#define FUS_PAYLOAD_MAX (FUS_UNBOXED_MAX >> FUS_TAG_SHIFT)


#define FUS_VALUE_CAST  (fus_value_t)(fus_unboxed_t)

#define FUS_VALUE_ERR   ((fus_value_t)(fus_boxed_t*) NULL)
#define FUS_VALUE_NULL  (FUS_VALUE_CAST FUS_ADD_TAG(FUS_TAG_OTHER, 0))
#define FUS_VALUE_TRUE  (FUS_VALUE_CAST FUS_ADD_TAG(FUS_TAG_OTHER, 1))
#define FUS_VALUE_FALSE (FUS_VALUE_CAST FUS_ADD_TAG(FUS_TAG_OTHER, 2))


#define FUS_IS_INT(VALUE)  (FUS_GET_TAG((VALUE).i) == FUS_TAG_INT)
#define FUS_IS_SYM(VALUE)  (FUS_GET_TAG((VALUE).i) == FUS_TAG_SYM)
#define FUS_IS_NULL(VALUE) ((VALUE).i == FUS_VALUE_NULL.i)
#define FUS_IS_BOOL(VALUE) \
    ( (VALUE).i == FUS_VALUE_TRUE.i || (VALUE).i == FUS_VALUE_FALSE.i )
#define FUS_IS_ERR(VALUE)  ((VALUE).p == NULL)
#define FUS_IS_UNBOXED(VALUE) \
    ( FUS_GET_TAG((VALUE).i) == FUS_TAG_BOXED && (VALUE).p != NULL )


typedef long int fus_unboxed_t;
#define FUS_UNBOXED_MIN LONG_MIN
#define FUS_UNBOXED_MAX LONG_MAX

typedef fus_unboxed_t fus_sym_i_t;


union fus_value {
    fus_unboxed_t i;
    fus_boxed_t *p;
};


typedef enum {
    FUS_ERR_WRONG_TYPE,
    FUS_ERR_OVERFLOW,
    FUS_ERR_UNDERFLOW,
    FUS_ERRS
} fus_err_code_t;

const char *fus_err_code_msg(fus_err_code_t code);



#ifndef FUS_EXIT_ON_ERR
/* default */
#define FUS_EXIT_ON_ERR 1
#endif

#ifndef FUS_PRINT_ERRS_TO_STDERR
/* default */
#define FUS_PRINT_ERRS_TO_STDERR 1
#endif

#ifndef FUS_USE_CURRENT_ERR_CODE
/* default */
#define FUS_USE_CURRENT_ERR_CODE 0
#endif

#if FUS_USE_CURRENT_ERR_CODE
extern fus_err_code_t fus_current_err_code;
#endif






fus_value_t fus_err(fus_vm_t *vm, fus_err_code_t code);


fus_value_t fus_sym(fus_vm_t *vm, fus_sym_i_t sym_i);
fus_sym_i_t fus_sym_decode(fus_value_t value);

fus_value_t fus_int(fus_vm_t *vm, fus_unboxed_t i);
fus_unboxed_t fus_int_decode(fus_value_t value);

fus_value_t fus_bool(fus_vm_t *vm, bool b);
bool fus_bool_decode(fus_value_t value);


fus_value_t fus_eq(fus_vm_t *vm,
    fus_value_t value_x, fus_value_t value_y);


void fus_value_cleanup(fus_vm_t *vm, fus_value_t value);
void fus_value_attach(fus_vm_t *vm, fus_value_t value);
void fus_value_detach(fus_vm_t *vm, fus_value_t value);


/*******************
 * FUS_CLASS STUFF *
 *******************/

struct fus_value_class_data {
    fus_vm_t *vm;
};

void fus_value_class_data_init(fus_value_class_data_t *data, fus_vm_t *vm);

void fus_class_init_value(fus_class_t *class, void *ptr);
void fus_class_cleanup_value(fus_class_t *class, void *ptr);


#endif
