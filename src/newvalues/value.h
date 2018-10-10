#ifndef _FUS_VALUE_H_
#define _FUS_VALUE_H_

/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


#define FUS_TAG_COLLECTION 0x0
#define FUS_TAG_INT        0x1
#define FUS_TAG_SYM        0x2
#define FUS_TAG_OTHER      0x3
#define FUS_GET_TAG(x) ((x).i & ~0x3)
#define FUS_GET_PAYLOAD(x) ((x).i >> 2)
#define FUS_BUILD(tag, x) ((fus_value_t)( \
    ((fus_payload_t)(x) << 2) | (fus_tag_t)(tag) \
))


#define FUS_VALUE_ERR   FUS_BUILD(FUS_TAG_COLLECTION, 0)
    /* NOTE: FUS_VALUE_ERR == NULL */

#define FUS_VALUE_NULL  FUS_BUILD(FUS_TAG_OTHER, 0)
#define FUS_VALUE_TRUE  FUS_BUILD(FUS_TAG_OTHER, 1)
#define FUS_VALUE_FALSE FUS_BUILD(FUS_TAG_OTHER, 2)


typedef long int fus_int_t;
typedef unsigned long int fus_uint_t;
#define FUS_INT_MIN LONG_MIN
#define FUS_INT_MAX LONG_MAX

typedef fus_uint_t fus_built_t;
typedef fus_uint_t fus_tag_t;
typedef fus_int_t fus_payload_t;
typedef fus_payload_t fus_sym_i_t;

typedef union {
    fus_built_t i;
    struct fus_collection *c;
} fus_value_t;


typedef enum {
    FUS_ERR_WRONG_TYPE,
    FUS_ERR_OVERFLOW,
    FUS_ERR_UNDERFLOW,
    FUS_ERRS
} fus_err_code_t;

const char *fus_err_code_msg(fus_err_code_t code);



#ifndef FUS_ABORT_ON_ERR
/* default */
#define FUS_ABORT_ON_ERR 1
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






fus_value_t fus_err(fus_err_code_t code);


fus_value_t fus_sym(fus_sym_i_t sym_i);
fus_sym_i_t fus_sym_decode(fus_value_t value);

fus_value_t fus_int(fus_int_t i);
fus_int_t fus_int_decode(fus_value_t value);


fus_value_t fus_int_add(fus_value_t value_x, fus_value_t value_y);
fus_value_t fus_int_sub(fus_value_t value_x, fus_value_t value_y);
fus_value_t fus_int_mul(fus_value_t value_x, fus_value_t value_y);

fus_value_t fus_bool(bool b);
bool fus_bool_decode(fus_value_t value);


fus_value_t fus_eq(fus_value_t value_x, fus_value_t value_y);



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_init_value(fus_class_t *class, void *ptr);
void fus_class_cleanup_value(fus_class_t *class, void *ptr);


#endif
