#ifndef _FUS_ARRAY_H_
#define _FUS_ARRAY_H_

/* fus_array_t builds on fus_class_t, implementing basic arrays of
    class instances. */


#include "core.h"
#include "class.h"

#define FUS_ARRAY_ELEM_SIZE(ARRAY) ((ARRAY).class->instance_size)
#define FUS_ARRAY_GET_REF(ARRAY, I) \
    ( (void*)( (ARRAY).elems + (I) * FUS_ARRAY_ELEM_SIZE(ARRAY) ) )
#define FUS_ARRAY_GET(ARRAY, I, T) \
    ( * ((T)*) FUS_ARRAY_GET_REF(ARRAY, I) )


typedef int fus_array_len_t;

typedef struct fus_array {
    fus_class_t *class;
    char *elems;
    fus_array_len_t len;
    size_t size;
} fus_array_t;



void fus_array_init(fus_array_t *array, fus_class_t *class);
void fus_array_cleanup(fus_array_t *array);

void fus_array_set_len(fus_array_t *array, fus_array_len_t new_len);

#endif