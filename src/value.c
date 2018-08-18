
#include "includes.h"


#define FUS_VALUE_ATTACH(T, tt, v) { \
    fus_##T##_t *t = v.data.tt; \
    if(t != NULL){ \
        t->refcount++; \
    } \
}

#define FUS_VALUE_DETACH(T, tt, v) { \
    fus_##T##_t *t = v.data.tt; \
    if(t != NULL){ \
        t->refcount--; \
        if(t->refcount <= 0){ \
            if(t->refcount < 0){ \
                fprintf(stderr, #T " with negative refcount: %p\n", \
                    t); \
            } \
            fus_##T##_cleanup(t); \
            free(t); \
            v.data.tt = NULL; \
        } \
    } \
}

void fus_value_attach(fus_value_t value){
    if(value.type == FUS_TYPE_BIGINT){
        FUS_VALUE_ATTACH(bigint, bi, value)
    }else if(value.type == FUS_TYPE_STR){
        FUS_VALUE_ATTACH(str, s, value)
    }else if(value.type == FUS_TYPE_ARR){
        FUS_VALUE_ATTACH(arr, a, value)
    }else if(value.type == FUS_TYPE_OBJ){
        FUS_VALUE_ATTACH(obj, o, value)
    }
}

void fus_value_detach(fus_value_t value){
    if(value.type == FUS_TYPE_BIGINT){
        FUS_VALUE_DETACH(bigint, bi, value)
    }else if(value.type == FUS_TYPE_STR){
        FUS_VALUE_DETACH(str, s, value)
    }else if(value.type == FUS_TYPE_ARR){
        FUS_VALUE_DETACH(arr, a, value)
    }else if(value.type == FUS_TYPE_OBJ){
        FUS_VALUE_DETACH(obj, o, value)
    }
}

void fus_value_cleanup(fus_value_t value){
    if(value.type == FUS_TYPE_BIGINT){
        fus_bigint_cleanup(value.data.bi);
    }else if(value.type == FUS_TYPE_STR){
        fus_str_cleanup(value.data.s);
    }else if(value.type == FUS_TYPE_ARR){
        fus_arr_cleanup(value.data.a);
    }else if(value.type == FUS_TYPE_OBJ){
        fus_obj_cleanup(value.data.o);
    }
}



fus_value_t fus_value_null(){
    fus_value_t value;
    value.type = FUS_TYPE_NULL;
    value.data.i = 0;
    return value;
}

fus_value_t fus_value_bool(bool b){
    fus_value_t value;
    value.type = FUS_TYPE_BOOL;
    value.data.b = b;
    return value;
}

fus_value_t fus_value_int(int i){
    fus_value_t value;
    value.type = FUS_TYPE_INT;
    value.data.i = i;
    return value;
}

fus_str_t *fus_str(const char *ss){
    if(ss == NULL)return NULL;
    fus_str_t *s = malloc(sizeof(*s));
    if(s == NULL)return NULL;
    s->text = strdup(ss);
    if(s->text == NULL){
        free(s);
        return NULL;
    }
    int text_len = strlen(s->text);
    s->text_len = text_len; /* or text_len + 1 ?.. */
    s->text_size = text_len + 1;
    return s;
}

fus_value_t fus_value_str(const char *ss){
    fus_value_t value;
    value.type = FUS_TYPE_STR;
    if(ss == NULL)value.data.s = NULL;
    else{
        value.data.s = fus_str(ss);
        if(value.data.s == NULL){
            const char *msg = "Could not create fus_str_t";
            fprintf(stderr, "%s\n", msg);
            return fus_value_err(msg);
        }
    }
    return value;
}

void fus_sym_cleanup(fus_sym_t *sym){
    free(sym->token);
    sym->token = NULL;
}

int fus_sym_init(fus_sym_t *sym, const char *token, int token_len,
    int index
){
    sym->token = strndup(token, token_len);
    if(sym->token == NULL)return 1;
    sym->token_len = token_len;
    sym->index = index;
    return 0;
}

fus_value_t fus_value_sym(fus_sym_t *y){
    fus_value_t value;
    value.type = FUS_TYPE_SYM;
    value.data.y = y;
    return value;
}

fus_value_t fus_value_arr(){
    fus_value_t value;
    value.type = FUS_TYPE_ARR;
    value.data.a = NULL;
    return value;
}

fus_value_t fus_value_obj(){
    fus_value_t value;
    value.type = FUS_TYPE_OBJ;
    value.data.o = NULL;
    return value;
}

fus_value_t fus_value_fun(fus_code_t *code){
    fus_value_t value;
    value.type = FUS_TYPE_FUN;
    value.data.f = code;
    return value;
}

fus_value_t fus_value_err(const char *msg){
    fus_value_t value;
    value.type = FUS_TYPE_ERR;
    value.data.msg = msg;
    return value;
}






void fus_bigint_cleanup(fus_bigint_t *bi){
    if(bi == NULL)return;
    ARRAY_FREE(int, bi->digits, (void))
}

void fus_str_cleanup(fus_str_t *s){
    if(s == NULL)return;
    ARRAY_FREE(char, s->text, (void))
}

void fus_arr_cleanup(fus_arr_t *a){
    if(a == NULL)return;
    ARRAY_FREE_BYVAL(fus_value_t, a->values, fus_value_detach)
}

void fus_obj_entry_cleanup(fus_obj_entry_t *entry){
    if(entry == NULL)return;
    fus_value_detach(entry->value);
}

int fus_obj_entry_init(fus_obj_entry_t *entry, fus_sym_t *key,
    fus_value_t value
){
    entry->key = key;
    entry->value = value;
    fus_value_attach(value);
    return 0;
}

void fus_obj_cleanup(fus_obj_t *o){
    if(o == NULL)return;
    ARRAY_FREE(fus_obj_entry_t, o->entries, fus_obj_entry_cleanup)
}

int fus_obj_init(fus_obj_t *o){
    o->refcount = 0;
    ARRAY_INIT(o->entries)
    return 0;
}
