#ifndef _FUS_VALUE_H_
#define _FUS_VALUE_H_

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


/* NOTE: our home-rolled bit fiddling probably won't work with one's
compliment integers, etc. */
#define FUS_TAG_COLLECTION ((fus_tag_t)0x0)
#define FUS_TAG_INT        ((fus_tag_t)0x1)
#define FUS_TAG_SYM        ((fus_tag_t)0x2)
#define FUS_TAG_OTHER      ((fus_tag_t)0x3)
#define FUS_GET_TAG(x) ((fus_tag_t)( \
    (fus_built_t)(x) & (fus_tag_t)0x3 \
))
#define FUS_GET_PAYLOAD(x) ((fus_payload_t)( \
    (fus_built_t)(x) >> 2 \
))
#define FUS_BUILD(tag, x) ((fus_built_t)( \
    ((fus_built_t)(x) << 2) | (fus_tag_t)(tag) \
))
#define FUS_PAYLOAD_MIN FUS_GET_PAYLOAD(FUS_BUILD(0, FUS_INT_MIN))
#define FUS_PAYLOAD_MAX FUS_GET_PAYLOAD(FUS_BUILD(0, FUS_INT_MAX))


#define FUS_VALUE_ERR   ((fus_value_t)FUS_BUILD(FUS_TAG_COLLECTION, 0))
    /* NOTE: FUS_VALUE_ERR == NULL */

#define FUS_VALUE_NULL  ((fus_value_t)FUS_BUILD(FUS_TAG_OTHER, 0))
#define FUS_VALUE_TRUE  ((fus_value_t)FUS_BUILD(FUS_TAG_OTHER, 1))
#define FUS_VALUE_FALSE ((fus_value_t)FUS_BUILD(FUS_TAG_OTHER, 2))


typedef long int fus_int_t;
typedef unsigned long int fus_uint_t;
#define FUS_INT_MIN LONG_MIN
#define FUS_INT_MAX LONG_MAX

typedef fus_uint_t fus_built_t;
typedef fus_uint_t fus_tag_t;
typedef fus_int_t fus_payload_t;
typedef fus_payload_t fus_sym_i_t;

union fus_value {
    fus_built_t i;
    fus_collection_t *c;
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

fus_value_t fus_int(fus_vm_t *vm, fus_int_t i);
fus_int_t fus_int_decode(fus_value_t value);

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
